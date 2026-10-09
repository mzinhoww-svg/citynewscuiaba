// @vitest-environment node
// Revisão P1/P3-GATE (MÉDIA 4): imagem do bucket privado só pela rota /api/media/[id], que lê o
// asset com a RLS pública (aprovada; reprodução só com a flag) e confere de novo.
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { mediaServeDeps } from "@/lib/db/media-serve";
import type { Database } from "@/lib/db/types";
import { serveMedia } from "@/lib/media/serve";
import { createMemoryMediaStore } from "@/lib/media/store";

const service = createServiceClient();
const ids: string[] = [];

async function asset(kind: "original" | "reproduction", status: "approved" | "pending") {
  const { data, error } = await service
    .from("media_assets")
    .insert({
      kind,
      storage_path: `teste/${kind}-${status}-${Date.now()}.jpg`,
      license: "teste",
      allowed_use: "teste",
      status,
      content_type: "image/jpeg",
    })
    .select("id, storage_path")
    .single();
  if (error || !data) throw new Error(error?.message);
  ids.push(data.id);
  return data;
}

const setFlag = (enabled: boolean) =>
  service.from("feature_flags").update({ enabled }).eq("key", "image_reproduction_enabled");

afterAll(async () => {
  await setFlag(true);
  if (ids.length) await service.from("media_assets").delete().in("id", ids);
});

describe("rota de mídia com banco real", () => {
  it("aprovada serve; pendente e reprodução com flag desligada dão 404", async () => {
    const ok = await asset("original", "approved");
    const pending = await asset("original", "pending");
    const rep = await asset("reproduction", "approved");
    const store = createMemoryMediaStore();
    for (const a of [ok, pending, rep])
      await store.put(a.storage_path, new Uint8Array([7]), "image/jpeg");
    const deps = { ...mediaServeDeps(), store };

    expect((await serveMedia(ok.id, deps)).status).toBe(200);
    expect((await serveMedia(pending.id, deps)).status).toBe(404);
    expect((await serveMedia(rep.id, deps)).status).toBe(200);
    await setFlag(false);
    expect((await serveMedia(rep.id, deps)).status).toBe(404);
    await setFlag(true);
  });
});

describe("leitura pública segue o Media Registry (0205, ARD-T4)", () => {
  it("retirado, vencido ou com direitos bloqueados: o anon não lê e a rota dá 404", async () => {
    const store = createMemoryMediaStore();
    const deps = { ...mediaServeDeps(), store };
    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const cases: Database["public"]["Tables"]["media_assets"]["Update"][] = [
      { removed_at: new Date().toISOString() },
      { license_until: yesterday },
      { rights_status: "blocked" },
      { rights_status: "expired" },
    ];
    for (const patch of cases) {
      const a = await asset("reproduction", "approved");
      await store.put(a.storage_path, new Uint8Array([7]), "image/jpeg");
      expect((await serveMedia(a.id, deps)).status).toBe(200);
      const u = await service.from("media_assets").update(patch).eq("id", a.id);
      expect(u.error).toBeNull();
      const pub = await anon.from("media_assets").select("id").eq("id", a.id);
      expect(pub.data, JSON.stringify(patch)).toEqual([]);
      expect((await serveMedia(a.id, deps)).status, JSON.stringify(patch)).toBe(404);
    }
    // Validade que vence hoje ainda vale.
    const ok = await asset("reproduction", "approved");
    await service.from("media_assets").update({ license_until: today }).eq("id", ok.id);
    expect((await anon.from("media_assets").select("id").eq("id", ok.id)).data).toHaveLength(1);
  });
});
