// @vitest-environment node
// Item 79: variantes por largura do mesmo ativo (sem ativo novo), `?w=` na rota com o original de
// reserva e URL direta da manchete. Banco real; Storage em memória (A-017).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { resolveDirectImage } from "@/lib/db/media-direct";
import { mediaServeDeps } from "@/lib/db/media-serve";
import { makeVariants } from "@/lib/media/make-variants";
import { mediaHref, serveMedia } from "@/lib/media/serve";
import { createMemoryMediaStore, type MediaStore } from "@/lib/media/store";
import { saveVariants, variantPath } from "@/lib/media/variants";

const service = createServiceClient();
const ids: string[] = [];
const bytes = new Uint8Array(
  readFileSync(join(process.cwd(), "tests/fixtures/images/reproducao-1600x900.jpg")),
);

async function asset(kind: "original" | "reproduction", width: number | null) {
  const { data, error } = await service
    .from("media_assets")
    .insert({
      kind,
      storage_path: `teste/variantes-${kind}-${Date.now()}-${ids.length}.jpg`,
      license: "teste",
      allowed_use: "teste",
      status: "approved",
      content_type: "image/jpeg",
      width,
      height: width ? Math.round((width * 9) / 16) : null,
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

describe("variantes por largura com banco real", () => {
  it("?w= serve a variante WebP do mesmo ativo; sem variante, o original", async () => {
    const before = await service.from("media_assets").select("id", { count: "exact", head: true });
    const a = await asset("original", 1600);
    const store = createMemoryMediaStore();
    await store.put(a.storage_path, bytes, "image/jpeg");
    const saved = await saveVariants(store, a.storage_path, bytes, makeVariants);
    expect(saved).toEqual({ saved: [480, 960, 1440], failed: [] });
    // Variante não é ativo novo no Media Registry.
    const after = await service.from("media_assets").select("id", { count: "exact", head: true });
    expect(after.count).toBe((before.count ?? 0) + 1);

    const deps = { ...mediaServeDeps(), store };
    const v = await serveMedia(a.id, deps, { width: 700 });
    expect(v.status).toBe(200);
    expect(v.headers.get("content-type")).toBe("image/webp");
    const vb = new Uint8Array(await v.arrayBuffer());
    expect(vb).toEqual(store.files.get(variantPath(a.storage_path, 960))?.bytes);

    const big = await serveMedia(a.id, deps, { width: 1600 });
    expect(big.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await big.arrayBuffer())).toEqual(bytes);

    store.files.delete(variantPath(a.storage_path, 480));
    const fallback = await serveMedia(a.id, deps, { width: 300 });
    expect(fallback.status).toBe(200);
    expect(fallback.headers.get("content-type")).toBe("image/jpeg");
  });

  it("reprodução com a flag desligada: nem a variante nem a URL direta saem", async () => {
    const a = await asset("reproduction", 1600);
    const signed: string[] = [];
    const store: MediaStore = {
      ...createMemoryMediaStore(),
      async signedUrl(path) {
        signed.push(path);
        return { ok: true, value: `https://x.supabase.co/sign/${path}` };
      },
    };
    const deps = { ...mediaServeDeps(), store };

    const direct = await resolveDirectImage(mediaHref(a.id), deps);
    expect(direct?.directSrc).toBe(`https://x.supabase.co/sign/${a.storage_path}`);
    expect(direct?.directSrcSet).toContain(`${variantPath(a.storage_path, 480)} 480w`);
    expect(direct?.directSrcSet).toContain(`${a.storage_path} 1600w`);

    await setFlag(false);
    signed.length = 0;
    expect((await serveMedia(a.id, deps, { width: 480 })).status).toBe(404);
    expect(await resolveDirectImage(mediaHref(a.id), deps)).toBeNull();
    expect(signed).toEqual([]);
    await setFlag(true);
  });
});
