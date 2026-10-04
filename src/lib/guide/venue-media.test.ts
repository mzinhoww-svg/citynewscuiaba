// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMemoryMediaStore } from "@/lib/media/store";
import type { CrawlDeps } from "@/lib/pipeline/http";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import { createMemoryMediaRepo } from "@/lib/pipeline/testing/memory-media-repo";
import { err, ok } from "@/lib/result";
import type { SiteFacts } from "./providers/site";
import {
  attachOfficialPhoto,
  guideTags,
  officialPhotoFor,
  takedownVenuePhoto,
  type VenueMediaDeps,
  type VenueMediaRepo,
} from "./venue-media";

const NOW = new Date("2026-10-03T15:00:00Z");
const image = (name: string) =>
  new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/images", name)));
const jpeg = (name: string): FakeRoute => ({
  body: image(name),
  headers: { "content-type": "image/jpeg" },
});

const VENUE = { id: "v1", name: "Padaria Pão Dourado", website: "https://paodourado.example/" };
const ROBOTS_OK: Record<string, FakeRoute> = {
  "https://paodourado.example/robots.txt": { body: "User-agent: *\nAllow: /" },
};

function setup(opts: {
  facts?: Partial<SiteFacts> | "robots" | "down";
  routes?: Record<string, FakeRoute>;
  reproduction?: boolean;
  failPut?: boolean;
}) {
  const mem = createMemoryMediaRepo();
  const links: { venueId: string; mediaId: string; credit: string; originUrl: string }[] = [];
  const repo: VenueMediaRepo = {
    assetByOrigin: (u) => mem.assetByOrigin(u),
    phashNeighbors: (p, d, o) => mem.phashNeighbors(p, d, o),
    async insertVenueAsset(a) {
      return mem.insertAsset({
        ...a,
        kind: "reproduction",
        sourceId: "venue",
        author: null,
        risk: "medio",
      });
    },
    async linkVenueMedia(l) {
      links.push(l);
    },
  };
  const { http, calls } = createFakeHttp({ ...ROBOTS_OK, ...opts.routes });
  const crawl: CrawlDeps = {
    repo: { hitRateLimit: async () => true },
    http,
    resolve: fakeResolve(),
    userAgent: "CityNewsBot/1.0",
  };
  const store = createMemoryMediaStore({ failPut: opts.failPut });
  const deps: VenueMediaDeps = {
    crawl,
    site: async () => {
      if (opts.facts === "robots") return err("robots" as const);
      if (opts.facts === "down") return err("unavailable" as const);
      return ok({
        pageUrl: "https://paodourado.example/",
        phone: null,
        hours: null,
        instagram: null,
        address: null,
        imageUrl: "https://paodourado.example/img/fachada.jpg",
        ...opts.facts,
      });
    },
    repo,
    store,
    reproductionEnabled: async () => opts.reproduction ?? true,
    now: () => NOW,
  };
  return { deps, mem, store, links, calls };
}

const GOOD = { "https://paodourado.example/img/fachada.jpg": jpeg("reproducao-1600x900.jpg") };

describe("officialPhotoFor", () => {
  it("foto do domínio oficial passa, com crédito e link da página de origem", async () => {
    const { deps } = setup({ routes: GOOD });
    const r = await officialPhotoFor(VENUE, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.credit).toBe("Foto: reprodução web · Padaria Pão Dourado");
    expect(r.value.pageUrl).toBe("https://paodourado.example/");
    expect(r.value.analysis.width).toBe(1600);
  });

  it("imagem de domínio de terceiro (CDN de outra empresa) nunca é copiada", async () => {
    const { deps, calls } = setup({
      facts: { imageUrl: "https://fotos-de-terceiros.example/x.jpg" },
      routes: { "https://fotos-de-terceiros.example/x.jpg": jpeg("reproducao-1600x900.jpg") },
    });
    expect(await officialPhotoFor(VENUE, deps)).toEqual({ ok: false, error: "none" });
    expect(calls.some((c) => c.url.includes("fotos-de-terceiros"))).toBe(false);
  });

  it("imagem do Google ou do TripAdvisor nunca entra, mesmo se o site apontar para elas", async () => {
    for (const imageUrl of [
      "https://lh3.googleusercontent.com/p/abc",
      "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/x.jpg",
      "https://maps.googleapis.com/maps/api/place/photo?photoreference=x",
    ]) {
      const { deps, calls } = setup({ facts: { imageUrl } });
      expect(await officialPhotoFor(VENUE, deps)).toEqual({ ok: false, error: "none" });
      expect(calls.some((c) => c.url === imageUrl)).toBe(false);
    }
  });

  it("subdomínio do próprio site vale", async () => {
    const { deps } = setup({
      facts: { imageUrl: "https://cdn.paodourado.example/fachada.jpg" },
      routes: {
        "https://cdn.paodourado.example/robots.txt": { status: 404 },
        "https://cdn.paodourado.example/fachada.jpg": jpeg("reproducao-1600x900.jpg"),
      },
    });
    expect((await officialPhotoFor(VENUE, deps)).ok).toBe(true);
  });

  it("sem site, sem imagem no site ou site fora do ar: none (cartão tipográfico)", async () => {
    expect(await officialPhotoFor({ ...VENUE, website: null }, setup({}).deps)).toEqual({
      ok: false,
      error: "none",
    });
    expect(await officialPhotoFor(VENUE, setup({ facts: { imageUrl: null } }).deps)).toEqual({
      ok: false,
      error: "none",
    });
    expect(await officialPhotoFor(VENUE, setup({ facts: "down" }).deps)).toEqual({
      ok: false,
      error: "none",
    });
  });

  it("robots.txt do site bloqueia a página ou a imagem: blocked, nada é baixado", async () => {
    expect(await officialPhotoFor(VENUE, setup({ facts: "robots" }).deps)).toEqual({
      ok: false,
      error: "blocked",
    });
    const { deps, calls } = setup({
      routes: {
        "https://paodourado.example/robots.txt": { body: "User-agent: *\nDisallow: /img/" },
        ...GOOD,
      },
    });
    expect(await officialPhotoFor(VENUE, deps)).toEqual({ ok: false, error: "blocked" });
    expect(calls.some((c) => c.url.endsWith("fachada.jpg"))).toBe(false);
  });

  it("menos de 600 px no lado maior: low_res", async () => {
    const { deps } = setup({
      routes: { "https://paodourado.example/img/fachada.jpg": jpeg("baixa-resolucao-500x281.jpg") },
    });
    expect(await officialPhotoFor(VENUE, deps)).toEqual({ ok: false, error: "low_res" });
  });

  it("arquivo que não é imagem raster (SVG) é recusado", async () => {
    const { deps } = setup({
      routes: {
        "https://paodourado.example/img/fachada.jpg": {
          body: readFileSync(join(process.cwd(), "tests/fixtures/images/vetor.svg"), "utf-8"),
          headers: { "content-type": "image/svg+xml" },
        },
      },
    });
    expect(await officialPhotoFor(VENUE, deps)).toEqual({ ok: false, error: "none" });
  });

  it("origem retirada a pedido nunca volta (blocked)", async () => {
    const { deps, mem } = setup({ routes: GOOD });
    const first = await attachOfficialPhoto(VENUE, deps);
    expect(first.status).toBe("attached");
    if (first.status !== "attached") return;
    const t = await takedownVenuePhoto(
      {
        repo: mem,
        store: deps.store,
        revalidate: async () => {},
        now: () => NOW,
        venuesOfMedia: async () => [],
      },
      first.mediaId,
      "editor-1",
      "Pedido do dono do lugar",
    );
    expect(t.ok).toBe(true);
    expect(await officialPhotoFor(VENUE, deps)).toEqual({ ok: false, error: "blocked" });
  });

  it("reprodução desligada pela flag: nenhuma foto de terceiro entra", async () => {
    const { deps, calls } = setup({ routes: GOOD, reproduction: false });
    expect(await officialPhotoFor(VENUE, deps)).toEqual({ ok: false, error: "blocked" });
    expect(calls).toHaveLength(0);
  });

  it("foto repetida (mesma imagem de outra origem) não entra duas vezes", async () => {
    const { deps, mem } = setup({
      routes: {
        "https://paodourado.example/img/fachada.jpg": jpeg("reproducao-1600x900.jpg"),
      },
    });
    // Mesma foto já guardada para outro lugar, com outra URL de origem.
    const analysis = await import("@/lib/media/analyze").then((m) =>
      m.analyzeImage(image("reproducao-1600x900.jpg")),
    );
    if (!analysis.ok) throw new Error("fixture inválida");
    await mem.insertAsset({
      kind: "reproduction",
      storagePath: "reproducao/x.jpg",
      originUrl: "https://outro.example/foto.jpg",
      pageUrl: "https://outro.example/",
      sourceId: "venue",
      sourceName: "Outro",
      author: null,
      license: "x",
      credit: "Foto: reprodução web · Outro",
      allowedUse: "venue:x",
      width: 1600,
      height: 900,
      phash: analysis.value.phash,
      sha256: "outro",
      contentType: "image/jpeg",
      risk: "medio",
      provenance: {},
    });
    expect(await officialPhotoFor(VENUE, deps)).toEqual({ ok: false, error: "none" });
  });
});

describe("attachOfficialPhoto", () => {
  it("guarda a cópia sem alterar, cria o ativo e liga ao lugar com crédito e origem", async () => {
    const { deps, store, links, mem } = setup({ routes: GOOD });
    const r = await attachOfficialPhoto(VENUE, deps);
    expect(r.status).toBe("attached");
    expect(store.files.size).toBe(1);
    const [stored] = [...store.files.values()];
    expect(stored!.bytes).toEqual(image("reproducao-1600x900.jpg"));
    expect(links).toEqual([
      {
        venueId: "v1",
        mediaId: r.status === "attached" ? r.mediaId : "",
        credit: "Foto: reprodução web · Padaria Pão Dourado",
        originUrl: "https://paodourado.example/img/fachada.jpg",
        position: 0,
      },
    ]);
    expect(mem.assets()).toHaveLength(1);
  });

  it("segunda vez com a mesma origem reaproveita o ativo, sem copiar de novo", async () => {
    const { deps, store, mem } = setup({ routes: GOOD });
    await attachOfficialPhoto(VENUE, deps);
    await attachOfficialPhoto(VENUE, deps);
    expect(store.files.size).toBe(1);
    expect(mem.assets()).toHaveLength(1);
  });

  it("falha do Storage vira cartão tipográfico, não erro", async () => {
    const { deps } = setup({ routes: GOOD, failPut: true });
    expect(await attachOfficialPhoto(VENUE, deps)).toEqual({
      status: "typographic",
      reason: "storage",
    });
  });

  it("sem foto oficial, o lugar fica com o cartão tipográfico", async () => {
    const { deps, links } = setup({ facts: { imageUrl: null } });
    expect(await attachOfficialPhoto(VENUE, deps)).toEqual({
      status: "typographic",
      reason: "none",
    });
    expect(links).toHaveLength(0);
  });
});

describe("takedownVenuePhoto", () => {
  it("bloqueia a foto, apaga a cópia e invalida o lugar e todas as listas que o citam", async () => {
    const { deps, store, mem } = setup({ routes: GOOD });
    const a = await attachOfficialPhoto(VENUE, deps);
    if (a.status !== "attached") throw new Error("não anexou");
    const tags: string[][] = [];
    const t = await takedownVenuePhoto(
      {
        repo: mem,
        store,
        revalidate: async (x) => void tags.push(x),
        now: () => NOW,
        venuesOfMedia: async () => [
          {
            venueId: "v1",
            venueSlug: "pao-dourado",
            listSlugs: ["padarias-cuiaba", "cafes-goiabeiras"],
          },
        ],
      },
      a.mediaId,
      "editor-1",
      "Pedido do estabelecimento",
    );
    expect(t).toEqual({
      ok: true,
      value: {
        blocked: 1,
        venues: ["pao-dourado"],
        lists: ["padarias-cuiaba", "cafes-goiabeiras"],
      },
    });
    expect(store.files.size).toBe(0);
    expect(mem.assets()[0]!.status).toBe("blocked");
    expect(tags[0]).toEqual([
      guideTags.index,
      guideTags.venue("pao-dourado"),
      guideTags.list("padarias-cuiaba"),
      guideTags.list("cafes-goiabeiras"),
    ]);
  });

  it("exige o motivo e recusa foto inexistente", async () => {
    const { deps, store, mem } = setup({});
    const base = {
      repo: mem,
      store,
      revalidate: async () => {},
      now: () => NOW,
      venuesOfMedia: async () => [],
    };
    expect(await takedownVenuePhoto(base, "x", "a", "  ")).toEqual({
      ok: false,
      error: "reason_required",
    });
    expect(await takedownVenuePhoto(base, "inexistente", "a", "motivo")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(deps).toBeDefined();
  });
});
