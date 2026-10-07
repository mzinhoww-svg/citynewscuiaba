import { createMemoryMediaStore, type MediaStore } from "./store";
import { MEDIA_URL_TTL_SEC, mediaHref, serveMedia, type ServableAsset } from "./serve";

const ID = "5b0a3f7e-8c1d-4e2f-9a6b-1c2d3e4f5a6b";
const asset = (over: Partial<ServableAsset> = {}): ServableAsset => ({
  id: ID,
  kind: "original",
  status: "approved",
  storagePath: "original/abc.jpg",
  contentType: "image/jpeg",
  ...over,
});

function deps(a: ServableAsset | null, opts: { flag?: boolean; store?: MediaStore } = {}) {
  const store = opts.store ?? createMemoryMediaStore();
  return {
    asset: async (id: string) => (a && a.id === id ? a : null),
    reproductionEnabled: async () => opts.flag ?? true,
    store,
  };
}

describe("rota de mídia aprovada (/api/media/[id], ADR-009)", () => {
  it("monta o endereço pela rota própria, nunca pela URL pública do bucket", () => {
    expect(mediaHref(ID)).toBe(`/api/media/${ID}`);
  });

  it("aprovada no Storage em memória: devolve os bytes com cache curto", async () => {
    const store = createMemoryMediaStore();
    await store.put("original/abc.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    const res = await serveMedia(ID, deps(asset(), { store }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toMatch(/max-age=\d+/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("Storage com URL assinada: redireciona para URL curta, cache menor que a validade", async () => {
    const signed: { path: string; ttl: number }[] = [];
    const store: MediaStore = {
      ...createMemoryMediaStore(),
      async signedUrl(path, ttl) {
        signed.push({ path, ttl });
        return {
          ok: true,
          value: `https://x.supabase.co/storage/v1/object/sign/media/${path}?token=t`,
        };
      },
    };
    const res = await serveMedia(ID, deps(asset(), { store }));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/\/object\/sign\/media\/original\/abc\.jpg/);
    expect(signed).toEqual([{ path: "original/abc.jpg", ttl: MEDIA_URL_TTL_SEC }]);
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1]);
    expect(maxAge).toBeLessThan(MEDIA_URL_TTL_SEC);
  });

  it("pendente, bloqueada, inexistente ou id inválido: 404", async () => {
    for (const a of [asset({ status: "pending" }), asset({ status: "blocked" }), null])
      expect((await serveMedia(ID, deps(a))).status).toBe(404);
    expect((await serveMedia("../../etc/passwd", deps(asset()))).status).toBe(404);
  });

  it("reprodução com a flag image_reproduction_enabled desligada: 404", async () => {
    const store = createMemoryMediaStore();
    await store.put("reproducao/abc.jpg", new Uint8Array([9]), "image/jpeg");
    const rep = asset({ kind: "reproduction", storagePath: "reproducao/abc.jpg" });
    expect((await serveMedia(ID, deps(rep, { flag: false, store }))).status).toBe(404);
    expect((await serveMedia(ID, deps(rep, { flag: true, store }))).status).toBe(200);
  });

  it("arquivo sumido do Storage: 404 sem cache", async () => {
    const res = await serveMedia(ID, deps(asset()));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  describe("?w= escolhe a variante (item 79)", () => {
    it("Storage em memória: serve a menor variante ≥ w em WebP", async () => {
      const store = createMemoryMediaStore();
      await store.put("original/abc.jpg", new Uint8Array([1]), "image/jpeg");
      await store.put("original/abc.w480.webp", new Uint8Array([4]), "image/webp");
      await store.put("original/abc.w960.webp", new Uint8Array([9]), "image/webp");
      const a = asset({ width: 2000 });
      const res = await serveMedia(ID, deps(a, { store }), { width: 600 });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/webp");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([9]));
    });

    it("sem a variante no Storage, cai no original", async () => {
      const store = createMemoryMediaStore();
      await store.put("original/abc.jpg", new Uint8Array([1]), "image/jpeg");
      const res = await serveMedia(ID, deps(asset({ width: 2000 }), { store }), { width: 480 });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/jpeg");
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1]));
    });

    it("w acima da maior variante ou maior que o original: original, sem tentar variante", async () => {
      const signed: string[] = [];
      const store: MediaStore = {
        ...createMemoryMediaStore(),
        async signedUrl(path) {
          signed.push(path);
          return { ok: true, value: `https://x.supabase.co/sign/${path}` };
        },
      };
      await serveMedia(ID, deps(asset({ width: 2000 }), { store }), { width: 1600 });
      await serveMedia(ID, deps(asset({ width: 600 }), { store }), { width: 960 });
      expect(signed).toEqual(["original/abc.jpg", "original/abc.jpg"]);
    });

    it("URL assinada: assina a variante; variante ausente assina o original", async () => {
      const signed: string[] = [];
      const store: MediaStore = {
        ...createMemoryMediaStore(),
        async signedUrl(path) {
          signed.push(path);
          if (path.includes(".w960.")) return { ok: false, error: "Object not found" };
          return { ok: true, value: `https://x.supabase.co/sign/${path}` };
        },
      };
      const a = asset({ width: 2000 });
      const r1 = await serveMedia(ID, deps(a, { store }), { width: 400 });
      expect(r1.headers.get("location")).toBe("https://x.supabase.co/sign/original/abc.w480.webp");
      const r2 = await serveMedia(ID, deps(a, { store }), { width: 900 });
      expect(r2.headers.get("location")).toBe("https://x.supabase.co/sign/original/abc.jpg");
      expect(signed).toEqual([
        "original/abc.w480.webp",
        "original/abc.w960.webp",
        "original/abc.jpg",
      ]);
    });

    it("reprodução com a flag desligada continua 404 mesmo pedindo variante", async () => {
      const store = createMemoryMediaStore();
      await store.put("reproducao/abc.w480.webp", new Uint8Array([4]), "image/webp");
      const rep = asset({ kind: "reproduction", storagePath: "reproducao/abc.jpg", width: 2000 });
      const res = await serveMedia(ID, deps(rep, { flag: false, store }), { width: 480 });
      expect(res.status).toBe(404);
    });
  });
});
