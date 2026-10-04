// @vitest-environment node
// GUIA-T3 · Foto oficial do lugar no banco real: ativo sem fonte, ligação ao lugar, retirada em 24 h
// (bloqueia, apaga a cópia, invalida lugar e todas as listas) e a RLS pública das fotos.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createVenueMediaRepo } from "@/lib/db/guide-media-store";
import { createMediaRepo } from "@/lib/db/pipeline-store";
import type { Database } from "@/lib/db/types";
import { analyzeImage } from "@/lib/media/analyze";
import { createMemoryMediaStore } from "@/lib/media/store";
import { guideTags, savePhoto, takedownVenuePhoto } from "@/lib/guide/venue-media";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = createServiceClient();
const repo = createVenueMediaRepo(db);
const mark = Date.now().toString(36);
const CRITERIA =
  "Reunimos padarias de Cuiabá com dados públicos e ordenamos por nota, ranking e menções. Só entram lugares com duas fontes.";

function anon() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

let venueId = "";
let otherVenueId = "";
const listIds: string[] = [];
let mediaId = "";
const store = createMemoryMediaStore();
const venueIds: string[] = [];

async function mkVenue(name: string, over: Record<string, unknown> = {}) {
  const r = await db
    .from("venues")
    .insert({ slug: `${name}-${mark}`, name, category: "padaria", ...over })
    .select("id")
    .single();
  if (r.error) throw r.error;
  venueIds.push(r.data.id);
  return r.data.id;
}

beforeAll(async () => {
  venueId = await mkVenue("padaria-foto-a", { website: `https://foto-a-${mark}.example` });
  otherVenueId = await mkVenue("padaria-foto-b");
  for (const n of [1, 2]) {
    const l = await db
      .from("guide_lists")
      .insert({
        slug: `lista-foto-${n}-${mark}`,
        title: `Lista de foto ${n}`,
        category: "padaria",
        criteria: CRITERIA,
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (l.error) throw l.error;
    listIds.push(l.data.id);
    await db.from("guide_list_items").insert([
      { list_id: l.data.id, venue_id: venueId, position: 1 },
      { list_id: l.data.id, venue_id: otherVenueId, position: 2 },
    ]);
  }
});

afterAll(async () => {
  await db.from("venue_media").delete().in("venue_id", venueIds);
  if (mediaId) await db.from("media_assets").delete().eq("id", mediaId);
  await db.from("guide_list_items").delete().in("list_id", listIds);
  await db.from("guide_lists").delete().in("id", listIds);
  await db.from("venues").delete().in("id", venueIds);
});

describe("foto oficial do lugar", () => {
  it("guarda o ativo sem fonte, com crédito e origem, e liga ao lugar", async () => {
    const bytes = new Uint8Array(
      readFileSync(join(process.cwd(), "tests/fixtures/images/reproducao-1600x900.jpg")),
    );
    const a = await analyzeImage(bytes);
    if (!a.ok) throw new Error("fixture inválida");
    const saved = await savePhoto(
      { id: venueId, name: "Padaria Foto A" },
      {
        imageUrl: `https://foto-a-${mark}.example/img/fachada.jpg`,
        pageUrl: `https://foto-a-${mark}.example/`,
        bytes,
        analysis: a.value,
        credit: "Foto: reprodução web · Padaria Foto A",
        existingAssetId: null,
      },
      { repo, store, now: () => new Date() },
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    mediaId = saved.value;

    const asset = await db.from("media_assets").select("*").eq("id", mediaId).single();
    expect(asset.data).toMatchObject({
      kind: "reproduction",
      status: "approved",
      source_id: null,
      source_name: "Padaria Foto A",
      credit: "Foto: reprodução web · Padaria Foto A",
      origin_url: `https://foto-a-${mark}.example/img/fachada.jpg`,
      width: 1600,
    });
    const link = await db.from("venue_media").select("*").eq("venue_id", venueId);
    expect(link.data).toHaveLength(1);
    expect(link.data?.[0]).toMatchObject({
      media_id: mediaId,
      credit: "Foto: reprodução web · Padaria Foto A",
    });
  });

  it("anon vê a foto de lugar de lista publicada (a de lugar sem lista, não)", async () => {
    const r = await anon().from("venue_media").select("media_id").eq("venue_id", venueId);
    expect(r.data?.map((x) => x.media_id)).toEqual([mediaId]);
    const asset = await anon().from("media_assets").select("id").eq("id", mediaId);
    expect(asset.data).toHaveLength(1);
  });

  it("lugares sem foto e com site entram na fila de fotos; os já tentados, não", async () => {
    const pending = await repo.venuesNeedingPhoto(new Date(Date.now() - 30 * 86_400_000), 500);
    expect(pending.some((v) => v.id === venueId)).toBe(false); // já tem foto
    const w = await mkVenue("padaria-foto-c", { website: `https://foto-c-${mark}.example` });
    const again = await repo.venuesNeedingPhoto(new Date(Date.now() - 30 * 86_400_000), 500);
    expect(again.some((v) => v.id === w)).toBe(true);
    await repo.markPhotoChecked(w, new Date());
    const after = await repo.venuesNeedingPhoto(new Date(Date.now() - 30 * 86_400_000), 500);
    expect(after.some((v) => v.id === w)).toBe(false);
  });

  it("retirada a pedido bloqueia a foto, apaga a cópia e invalida o lugar e TODAS as listas que o citam", async () => {
    const tags: string[][] = [];
    const t = await takedownVenuePhoto(
      {
        repo: createMediaRepo(db),
        store,
        revalidate: async (x) => void tags.push(x),
        now: () => new Date(),
        venuesOfMedia: repo.venuesOfMedia,
      },
      mediaId,
      "editor-teste",
      "Pedido do estabelecimento",
    );
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.value.blocked).toBe(1);
    expect(t.value.lists.sort()).toEqual([`lista-foto-1-${mark}`, `lista-foto-2-${mark}`]);
    expect(tags[0]).toContain(guideTags.venue(`padaria-foto-a-${mark}`));
    expect(tags[0]).toContain(guideTags.list(`lista-foto-1-${mark}`));
    expect(tags[0]).toContain(guideTags.list(`lista-foto-2-${mark}`));
    expect(store.files.size).toBe(0);

    const asset = await db
      .from("media_assets")
      .select("status, removal_reason")
      .eq("id", mediaId)
      .single();
    expect(asset.data?.status).toBe("blocked");
    const pub = await anon().from("media_assets").select("id").eq("id", mediaId);
    expect(pub.data ?? []).toEqual([]);
    // A origem retirada nunca volta a ser copiada.
    const known = await repo.assetByOrigin(`https://foto-a-${mark}.example/img/fachada.jpg`);
    expect(known?.status).toBe("blocked");
  });
});
