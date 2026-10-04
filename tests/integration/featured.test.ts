// @vitest-environment node
// FD-T1: tabelas e funções dos destaques com banco real (RLS, papéis, prazo, capacidade, capa).
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { clientOf } from "./studio";

const db = createServiceClient();
const tag = randomUUID().slice(0, 8);
const created = { articles: [] as string[], media: [] as string[], pins: [] as string[] };

const anon = () =>
  createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

async function article(
  name: string,
  over: { status?: "published" | "draft"; sponsored?: boolean; cover?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  const r = await db.from("articles").insert({
    id,
    slug: `fd-${tag}-${name}`,
    kind: "original",
    section_slug: "cidade",
    title: `Destaque ${name} ${tag}`,
    dek: "Linha fina",
    body: { type: "doc", content: [] },
    status: over.status ?? "published",
    published_at: new Date().toISOString(),
    sponsored: over.sponsored ?? false,
  });
  if (r.error) throw r.error;
  created.articles.push(id);
  if (over.cover !== false) {
    const m = await db
      .from("media_assets")
      .insert({
        kind: "original",
        storage_path: `fd/${tag}-${name}.jpg`,
        license: "própria",
        allowed_use: "editorial",
        status: "approved",
      })
      .select("id")
      .single();
    if (m.error) throw m.error;
    created.media.push(m.data.id);
    const l = await db.from("article_media").insert({
      article_id: id,
      media_id: m.data.id,
      rationale: "teste",
      chosen_by: "test",
      role: "cover",
    });
    if (l.error) throw l.error;
  }
  return id;
}

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

async function pinAs(
  user: "helena" | "marina" | "juliana",
  args: Parameters<Awaited<ReturnType<typeof clientOf>>["rpc"]>[1],
) {
  const c = await clientOf(user);
  return c.rpc("featured_pin", args as never);
}

async function clean() {
  await db.from("featured_items").delete().in("article_id", created.articles);
  await db.from("featured_image_requests").delete().in("article_id", created.articles);
  await db.from("article_media").delete().in("article_id", created.articles);
  await db.from("media_assets").delete().in("id", created.media);
  await db.from("articles").delete().in("id", created.articles);
}

let a1 = "";
let a2 = "";
let sponsored = "";
let draft = "";
let noCover = "";

beforeAll(async () => {
  // Limpa pinos de execuções anteriores e abre espaço nas posições.
  await db.from("featured_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  [a1, a2, sponsored, draft, noCover] = await Promise.all([
    article("um"),
    article("dois"),
    article("pat", { sponsored: true }),
    article("rasc", { status: "draft" }),
    article("semcapa", { cover: false }),
  ]);
});

afterAll(clean);

describe("featured_slots", () => {
  it("traz as quatro posições do seed e é legível por anon", async () => {
    const { data, error } = await anon()
      .from("featured_slots")
      .select("key, capacity")
      .order("key");
    expect(error).toBeNull();
    expect(data).toEqual([
      { key: "editoria.lead", capacity: 1 },
      { key: "explorar.topo", capacity: 1 },
      { key: "home.destaques", capacity: 3 },
      { key: "home.lead", capacity: 1 },
    ]);
  });

  it("a lista de auditoria do banco conhece as ações dos destaques", async () => {
    const { data } = await db.rpc("studio_audit_actions");
    for (const a of ["featured.manage", "featured.pin", "featured.unpin", "featured.update"]) {
      expect(data).toContain(a);
      expect(AUDIT_ACTIONS).toContain(a);
    }
    // Nada que o banco já tinha foi perdido na união.
    expect(data).toContain("article.force_publish");
  });
});

describe("featured_pin / unpin / reorder", () => {
  it("usuário sem papel falha; admin e editor_chefe fixam", async () => {
    const denied = await pinAs("juliana", {
      p_slot: "home.destaques",
      p_section: null,
      p_article: a1,
      p_ends_at: inHours(2),
      p_note: "",
    });
    expect(denied.error?.code).toBe("42501");

    const ok = await pinAs("helena", {
      p_slot: "home.destaques",
      p_section: null,
      p_article: a1,
      p_ends_at: inHours(2),
      p_note: "teste",
    });
    expect(ok.error).toBeNull();
    created.pins.push(String(ok.data));
    const chefe = await pinAs("marina", {
      p_slot: "home.destaques",
      p_section: null,
      p_article: a2,
      p_ends_at: null,
      p_note: "",
    });
    expect(chefe.error).toBeNull();
  });

  it("anon lê só pino ativo de matéria publicada e não escreve", async () => {
    const pub = await anon()
      .from("featured_items")
      .select("article_id")
      .in("article_id", created.articles);
    expect(pub.error).toBeNull();
    expect((pub.data ?? []).map((r) => r.article_id).sort()).toEqual([a1, a2].sort());

    const write = await anon()
      .from("featured_items")
      .insert({ slot_key: "home.lead", article_id: a1 });
    expect(write.error).not.toBeNull();
    const rpc = await anon().rpc("featured_pin", {
      p_slot: "home.lead",
      p_section: null as never,
      p_article: a1,
      p_ends_at: null as never,
      p_note: "",
    });
    expect(rpc.error?.code).toBe("42501");
  });

  it("matéria despublicada some da leitura pública sem apagar o pino", async () => {
    await db.from("articles").update({ status: "unpublished" }).eq("id", a2);
    const pub = await anon().from("featured_items").select("article_id").eq("article_id", a2);
    expect(pub.data).toEqual([]);
    const staff = await db.from("featured_items").select("id").eq("article_id", a2);
    expect(staff.data).toHaveLength(1);
    await db.from("articles").update({ status: "published" }).eq("id", a2);
  });

  it("recusa patrocinada, rascunho, sem capa, prazo inválido e posição inexistente", async () => {
    const base = { p_section: null as never, p_note: "", p_ends_at: inHours(2) };
    const slot = "explorar.topo";
    const code = async (article: string, extra: Record<string, unknown> = {}) =>
      (await pinAs("helena", { p_slot: slot, p_article: article, ...base, ...extra })).error
        ?.message;
    expect(await code(sponsored)).toContain("featured:ineligible");
    expect(await code(draft)).toContain("featured:ineligible");
    expect(await code(noCover)).toContain("featured:no_cover");
    expect(await code(a1, { p_ends_at: inHours(-1) })).toContain("featured:duration");
    expect(await code(a1, { p_ends_at: inHours(24 * 15) })).toContain("featured:duration");
    expect(await code(a1, { p_slot: "nao.existe" })).toContain("featured:slot");
    // editoria.lead exige editoria; home.lead não aceita
    expect(await code(a1, { p_slot: "editoria.lead" })).toContain("featured:slot");
    expect(await code(a1, { p_slot: "home.lead", p_section: "cidade" })).toContain("featured:slot");
  });

  it("capacidade: o trigger impede mais pinos ativos que a posição comporta; trocar libera", async () => {
    const first = await pinAs("helena", {
      p_slot: "home.lead",
      p_section: null as never,
      p_article: a1,
      p_ends_at: null as never,
      p_note: "",
    });
    expect(first.error).toBeNull();
    const second = await pinAs("helena", {
      p_slot: "home.lead",
      p_section: null as never,
      p_article: a2,
      p_ends_at: null as never,
      p_note: "",
    });
    expect(second.error?.message).toContain("featured:capacity");
    // direto pelo service role, o trigger também barra
    const direct = await db
      .from("featured_items")
      .insert({ slot_key: "home.lead", article_id: a2 });
    expect(direct.error?.message).toContain("featured:capacity");
    const swap = await pinAs("helena", {
      p_slot: "home.lead",
      p_section: null as never,
      p_article: a2,
      p_ends_at: null as never,
      p_note: "",
      p_replace: first.data as never,
    });
    expect(swap.error).toBeNull();
    const ended = await db
      .from("featured_items")
      .select("ended_at")
      .eq("id", String(first.data))
      .single();
    expect(ended.data?.ended_at).not.toBeNull();
  });

  it("unpin grava ended_at (sem DELETE) e some da leitura pública; sem papel falha", async () => {
    const id = String(
      (
        await pinAs("helena", {
          p_slot: "explorar.topo",
          p_section: null as never,
          p_article: a1,
          p_ends_at: inHours(3),
          p_note: "",
        })
      ).data,
    );
    const denied = await (await clientOf("juliana")).rpc("featured_unpin", { p_id: id });
    expect(denied.error?.code).toBe("42501");
    const ok = await (await clientOf("marina")).rpc("featured_unpin", { p_id: id });
    expect(ok.error).toBeNull();
    const row = await db.from("featured_items").select("ended_at").eq("id", id).single();
    expect(row.data?.ended_at).not.toBeNull();
    const again = await (await clientOf("marina")).rpc("featured_unpin", { p_id: id });
    expect(again.error?.code).toBe("P0002");
    const del = await (await clientOf("helena")).from("featured_items").delete().eq("id", id);
    expect(del.error ?? (del.status >= 400 ? true : null)).not.toBeNull();
  });

  it("reorder muda a posição dos pinos ativos pela ordem dada", async () => {
    await db
      .from("featured_items")
      .update({ ended_at: new Date().toISOString() })
      .eq("slot_key", "home.destaques")
      .is("ended_at", null);
    const ids: string[] = [];
    for (const art of [a1, a2]) {
      const r = await pinAs("helena", {
        p_slot: "home.destaques",
        p_section: null as never,
        p_article: art,
        p_ends_at: null as never,
        p_note: "",
      });
      expect(r.error).toBeNull();
      ids.push(String(r.data));
    }
    const c = await clientOf("helena");
    const re = await c.rpc("featured_reorder", {
      p_slot: "home.destaques",
      p_ids: [ids[1]!, ids[0]!],
    });
    expect(re.error).toBeNull();
    const rows = await db.from("featured_items").select("id, position").in("id", ids);
    const pos = new Map((rows.data ?? []).map((r) => [r.id, r.position]));
    expect(pos.get(ids[1]!)).toBe(0);
    expect(pos.get(ids[0]!)).toBe(1);
    const bad = await c.rpc("featured_reorder", {
      p_slot: "home.destaques",
      p_ids: [ids[0]!, randomUUID()],
    });
    expect(bad.error?.code).toBe("P0002");
  });
});

describe("featured_request_images (R39)", () => {
  it("enfileira a busca de imagem só de matéria publicada sem capa, uma vez a cada 3 h", async () => {
    const anonDb = anon();
    const first = await anonDb.rpc("featured_request_images", { p_ids: [noCover, a1, draft] });
    expect(first.error).toBeNull();
    expect(first.data).toBe(1);
    const again = await anonDb.rpc("featured_request_images", { p_ids: [noCover] });
    expect(again.data).toBe(0);
    const job = await db
      .from("jobs")
      .select("queue, message")
      .eq("dedupe_key", `image:article:${noCover}`);
    expect(job.data).toHaveLength(1);
    expect(job.data?.[0]?.queue).toBe("media");
    expect(job.data?.[0]?.message).toMatchObject({ step: "image", itemRef: `article:${noCover}` });
    await db.from("jobs").delete().eq("dedupe_key", `image:article:${noCover}`);
  });
});
