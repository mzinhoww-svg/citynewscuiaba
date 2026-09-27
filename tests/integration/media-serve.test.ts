// @vitest-environment node
// Revisão P1/P3-GATE (MÉDIA 4): imagem do bucket privado só pela rota /api/media/[id], que lê o
// asset com a RLS pública (aprovada; reprodução só com a flag) e confere de novo.
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { mediaServeDeps } from "@/lib/db/media-serve";
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
