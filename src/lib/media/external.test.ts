// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { CrawlDeps } from "@/lib/pipeline/http";
import type { MediaAssetRecord } from "@/lib/pipeline/ports";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import {
  cdnHostsOf,
  registerExternalImage,
  type ExternalImageDeps,
  type NewExternalAsset,
} from "./external";
import { createMemoryMediaStore } from "./store";

const NOW = new Date("2026-10-08T15:00:00Z");
const BIG = new Uint8Array(
  readFileSync(join(process.cwd(), "tests/fixtures/images/reproducao-1600x900.jpg")),
);
const jpeg = (body: Uint8Array): FakeRoute => ({ body, headers: { "content-type": "image/jpeg" } });
const PAGE = "https://teatro-cerrado.example/evento/forro";
const IMG = "https://teatro-cerrado.example/img/forro.jpg";
const ROBOTS: Record<string, FakeRoute> = {
  "https://teatro-cerrado.example/robots.txt": { body: "User-agent: *\nAllow: /" },
  "https://cdn.cerrado-midia.example/robots.txt": { status: 404 },
  "https://outro-site.example/robots.txt": { status: 404 },
};

async function smallJpeg(width: number): Promise<Uint8Array> {
  const buf = await sharp({
    create: { width, height: 200, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .jpeg()
    .toBuffer();
  return new Uint8Array(buf);
}

interface MemAsset extends MediaAssetRecord {
  sha256: string;
  details: NewExternalAsset;
}

function setup(
  routes: Record<string, FakeRoute>,
  opts: { flag?: boolean; failPut?: boolean } = {},
) {
  const assets: MemAsset[] = [];
  let seq = 0;
  const { http, calls } = createFakeHttp({ ...ROBOTS, ...routes });
  const crawl: CrawlDeps = {
    repo: { hitRateLimit: async () => true },
    http,
    resolve: fakeResolve(),
    userAgent: "CityNewsBot/1.0",
  };
  const store = createMemoryMediaStore({ failPut: opts.failPut });
  let flagReads = 0;
  const deps: ExternalImageDeps = {
    crawl,
    store,
    now: () => NOW,
    reproductionEnabled: async () => {
      flagReads++;
      return opts.flag ?? true;
    },
    repo: {
      async assetByOrigin(url) {
        return assets.find((a) => a.originUrl === url) ?? null;
      },
      async assetBySha256(sha) {
        return assets.find((a) => a.sha256 === sha) ?? null;
      },
      async insertExternalAsset(a) {
        const id = `m-${++seq}`;
        assets.push({
          id,
          kind: "reproduction",
          storagePath: a.storagePath,
          originUrl: a.originUrl,
          status: "approved",
          width: a.width,
          height: a.height,
          credit: a.credit,
          sourceId: null,
          tags: [],
          sha256: a.sha256,
          details: a,
        });
        return id;
      },
    },
  };
  return { deps, assets, calls, store, flagReads: () => flagReads };
}

const input = { url: IMG, pageUrl: PAGE, sourceName: "Teatro Cerrado" };

describe("registerExternalImage", () => {
  it("imagem do mesmo domínio da página: guarda no Media Registry com crédito e proveniência", async () => {
    const { deps, assets, store } = setup({ [IMG]: jpeg(BIG) });
    const r = await registerExternalImage(deps, input);
    expect(r).toEqual({ ok: true, value: { mediaId: "m-1" } });
    expect(assets).toHaveLength(1);
    const a = assets[0]!.details;
    expect(a).toMatchObject({
      originUrl: IMG,
      pageUrl: PAGE,
      sourceName: "Teatro Cerrado",
      credit: "Foto: reprodução web · Teatro Cerrado",
      width: 1600,
      height: 900,
    });
    expect(a.storagePath).toMatch(/^reproducao\/[0-9a-f]{64}\.jpg$/);
    expect(a.provenance).toMatchObject({ policy: "reproduction", unmodified: true });
    expect(store.files.size).toBe(1);
  });

  it("host diferente da página e não referenciado nela: host, sem baixar", async () => {
    const other = "https://outro-site.example/x.jpg";
    const { deps, calls } = setup({ [other]: jpeg(BIG) });
    expect(await registerExternalImage(deps, { ...input, url: other })).toEqual({
      ok: false,
      error: "host",
    });
    expect(calls.some((c) => c.url === other)).toBe(false);
  });

  it("CDN referenciada na própria página (cdnHosts) é aceita", async () => {
    const cdn = "https://cdn.cerrado-midia.example/forro.jpg";
    const { deps } = setup({ [cdn]: jpeg(BIG) });
    const r = await registerExternalImage(deps, {
      ...input,
      url: cdn,
      cdnHosts: ["cdn.cerrado-midia.example"],
    });
    expect(r.ok).toBe(true);
  });

  it("redirecionamento para outro domínio: host (a URL final também passa pela regra)", async () => {
    const other = "https://outro-site.example/x.jpg";
    const { deps, calls, assets } = setup({
      [IMG]: { status: 302, headers: { location: other } },
      [other]: jpeg(BIG),
    });
    expect(await registerExternalImage(deps, input)).toEqual({ ok: false, error: "host" });
    expect(calls.some((c) => c.url === other)).toBe(false);
    expect(assets).toHaveLength(0);
  });

  it("redirecionamento de https para http no mesmo site: host", async () => {
    const plain = "http://teatro-cerrado.example/img/forro.jpg";
    const { deps, calls, assets } = setup({
      [IMG]: { status: 302, headers: { location: plain } },
      [plain]: jpeg(BIG),
    });
    expect(await registerExternalImage(deps, input)).toEqual({ ok: false, error: "host" });
    expect(calls.some((c) => c.url === plain)).toBe(false);
    expect(assets).toHaveLength(0);
  });

  it("imagem em endereço IP é recusada, mesmo listada em cdnHosts", async () => {
    const ip = "https://93.184.215.14/cartaz.jpg";
    const { deps, calls } = setup({ [ip]: jpeg(BIG) });
    expect(
      await registerExternalImage(deps, { ...input, url: ip, cdnHosts: ["93.184.215.14"] }),
    ).toEqual({ ok: false, error: "host" });
    expect(calls).toHaveLength(0);
  });

  it("onNetwork só é avisado quando há pedido HTTP", async () => {
    let n = 0;
    const tick = () => void n++;
    const off = setup({ [IMG]: jpeg(BIG) }, { flag: false });
    await registerExternalImage(off.deps, input, tick);
    const other = setup({});
    await registerExternalImage(
      other.deps,
      { ...input, url: "https://outro-site.example/x.jpg" },
      tick,
    );
    expect(n).toBe(0);
    const good = setup({ [IMG]: jpeg(BIG) });
    await registerExternalImage(good.deps, input, tick);
    expect(n).toBe(1);
    // Origem já registrada: reaproveita sem rede.
    await registerExternalImage(good.deps, input, tick);
    expect(n).toBe(1);
  });

  it("só https", async () => {
    const { deps } = setup({});
    expect(
      await registerExternalImage(deps, { ...input, url: "http://teatro-cerrado.example/a.jpg" }),
    ).toEqual({ ok: false, error: "host" });
  });

  it("largura de 300 px: size, nada guardado", async () => {
    const { deps, assets } = setup({ [IMG]: jpeg(await smallJpeg(300)) });
    expect(await registerExternalImage(deps, input)).toEqual({ ok: false, error: "size" });
    expect(assets).toHaveLength(0);
  });

  it("400 px de largura já serve", async () => {
    const { deps } = setup({ [IMG]: jpeg(await smallJpeg(400)) });
    expect((await registerExternalImage(deps, input)).ok).toBe(true);
  });

  it("flag image_reproduction_enabled desligada: flag_off sem nenhum pedido HTTP", async () => {
    const { deps, calls } = setup({ [IMG]: jpeg(BIG) }, { flag: false });
    expect(await registerExternalImage(deps, input)).toEqual({ ok: false, error: "flag_off" });
    expect(calls).toHaveLength(0);
  });

  it("mesmo arquivo (sha256) em outra URL: mesmo mediaId, uma cópia só", async () => {
    const second = "https://teatro-cerrado.example/img/forro-copia.jpg";
    const { deps, assets, store } = setup({ [IMG]: jpeg(BIG), [second]: jpeg(BIG) });
    const a = await registerExternalImage(deps, input);
    const b = await registerExternalImage(deps, { ...input, url: second });
    expect(a).toEqual({ ok: true, value: { mediaId: "m-1" } });
    expect(b).toEqual({ ok: true, value: { mediaId: "m-1" } });
    expect(assets).toHaveLength(1);
    expect(store.files.size).toBe(1);
  });

  it("mesma URL já registrada: reaproveita sem baixar de novo", async () => {
    const { deps, calls } = setup({ [IMG]: jpeg(BIG) });
    await registerExternalImage(deps, input);
    const before = calls.filter((c) => c.url === IMG).length;
    expect(await registerExternalImage(deps, input)).toEqual({
      ok: true,
      value: { mediaId: "m-1" },
    });
    expect(calls.filter((c) => c.url === IMG).length).toBe(before);
  });

  it("ativo bloqueado (retirado a pedido) ou vencido nunca volta", async () => {
    const { deps, assets } = setup({ [IMG]: jpeg(BIG) });
    await registerExternalImage(deps, input);
    assets[0]!.status = "blocked";
    expect(await registerExternalImage(deps, input)).toEqual({ ok: false, error: "blocked" });
    // Mesmo arquivo em outra URL: o sha256 também barra.
    const second = "https://teatro-cerrado.example/img/outra.jpg";
    const s2 = setup({ [IMG]: jpeg(BIG), [second]: jpeg(BIG) });
    await registerExternalImage(s2.deps, input);
    s2.assets[0]!.rightsStatus = "expired";
    expect(await registerExternalImage(s2.deps, { ...input, url: second })).toEqual({
      ok: false,
      error: "blocked",
    });
  });

  it("robots.txt bloqueia a imagem: blocked", async () => {
    const { deps, calls } = setup({
      "https://teatro-cerrado.example/robots.txt": { body: "User-agent: *\nDisallow: /img/" },
      [IMG]: jpeg(BIG),
    });
    expect(await registerExternalImage(deps, input)).toEqual({ ok: false, error: "blocked" });
    expect(calls.some((c) => c.url === IMG)).toBe(false);
  });

  it("conteúdo que não é imagem raster: type; fora do ar: fetch", async () => {
    const svg = setup({
      [IMG]: {
        body: "<svg xmlns='http://www.w3.org/2000/svg'/>",
        headers: { "content-type": "image/svg+xml" },
      },
    });
    expect(await registerExternalImage(svg.deps, input)).toEqual({ ok: false, error: "type" });
    const html = setup({
      [IMG]: { body: "<html></html>", headers: { "content-type": "image/jpeg" } },
    });
    expect(await registerExternalImage(html.deps, input)).toEqual({ ok: false, error: "type" });
    const down = setup({ [IMG]: { status: 500 } });
    expect(await registerExternalImage(down.deps, input)).toEqual({ ok: false, error: "fetch" });
  });

  it("Storage fora: storage, sem ativo", async () => {
    const { deps, assets } = setup({ [IMG]: jpeg(BIG) }, { failPut: true });
    expect(await registerExternalImage(deps, input)).toEqual({ ok: false, error: "storage" });
    expect(assets).toHaveLength(0);
  });
});

describe("cdnHostsOf", () => {
  it("hosts que a página referencia fora da própria imagem", () => {
    const html = `<link rel="stylesheet" href="https://cdn.cerrado-midia.example/site.css">
      <meta property="og:image" content="https://fotos.terceiro.example/cartaz.jpg">
      <img src="//static.cerrado-midia.example/logo.png">`;
    const hosts = cdnHostsOf(html, "https://fotos.terceiro.example/cartaz.jpg");
    expect(hosts).toContain("cdn.cerrado-midia.example");
    expect(hosts).toContain("static.cerrado-midia.example");
    expect(hosts).not.toContain("fotos.terceiro.example");
  });

  it("a própria URL da imagem relativa ao protocolo (//host/caminho) não conta", () => {
    const html = `<img src="//fotos.terceiro.example/cartaz.jpg">
      <meta property="og:image" content="https://fotos.terceiro.example/cartaz.jpg">
      <a href="http://fotos.terceiro.example/cartaz.jpg">ver</a>`;
    expect(cdnHostsOf(html, "https://fotos.terceiro.example/cartaz.jpg")).toEqual([]);
  });

  it("host em maiúsculas no HTML é o mesmo host da imagem", () => {
    const html = `<img src="https://FOTOS.Terceiro.example/cartaz.jpg">`;
    expect(cdnHostsOf(html, "https://fotos.terceiro.example/cartaz.jpg")).toEqual([]);
  });

  it("endereço IP nunca vira CDN", () => {
    expect(
      cdnHostsOf('<script src="https://10.0.0.5/a.js"></script>', "https://x.example/a.jpg"),
    ).toEqual([]);
  });

  it("a própria URL da imagem (inclusive escapada em JSON) não conta como referência", () => {
    const json = '{"image":{"url":"https:\\/\\/fotos.terceiro.example\\/a.jpg"}}';
    expect(cdnHostsOf(json, "https://fotos.terceiro.example/a.jpg")).toEqual([]);
    const sizes =
      '{"image":{"url":"https:\\/\\/cdn.casa.example\\/a.jpg","sizes":{"m":{"url":"https:\\/\\/cdn.casa.example\\/a-300.jpg"}}}}';
    expect(cdnHostsOf(sizes, "https://cdn.casa.example/a.jpg")).toEqual(["cdn.casa.example"]);
  });
});
