// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMemoryMediaStore } from "@/lib/media/store";
import type { VenueMediaDeps, VenueMediaRepo } from "@/lib/guide/venue-media";
import { createFakeHttp, fakeResolve, type FakeRoute } from "../testing/fake-http";
import { createMemoryMediaRepo } from "../testing/memory-media-repo";
import { err, ok } from "@/lib/result";
import { runVenuePhotos, type PhotoCandidate, type VenuePhotoStore } from "./venue-photos";

const NOW = new Date("2026-10-03T15:00:00Z");
const jpeg = (name: string): FakeRoute => ({
  body: new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/images", name))),
  headers: { "content-type": "image/jpeg" },
});

function setup(candidates: PhotoCandidate[], routes: Record<string, FakeRoute>, withImage = true) {
  const mem = createMemoryMediaRepo();
  const links: string[] = [];
  const repo: VenueMediaRepo = {
    assetByOrigin: (u) => mem.assetByOrigin(u),
    phashNeighbors: (p, d, o) => mem.phashNeighbors(p, d, o),
    insertVenueAsset: (a) =>
      mem.insertAsset({
        ...a,
        kind: "reproduction",
        sourceId: "venue",
        author: null,
        risk: "medio",
      }),
    linkVenueMedia: async (l) => void links.push(l.venueId),
  };
  const checked: string[] = [];
  const photos: VenuePhotoStore = {
    venuesNeedingPhoto: async (_before, limit) => candidates.slice(0, limit),
    markPhotoChecked: async (id) => void checked.push(id),
  };
  const { http } = createFakeHttp(routes);
  const deps: VenueMediaDeps & { photos: VenuePhotoStore } = {
    crawl: {
      repo: { hitRateLimit: async () => true },
      http,
      resolve: fakeResolve(),
      userAgent: "CityNewsBot/1.0",
    },
    site: async (website) => {
      const host = new URL(website).hostname;
      return withImage || host !== "semfoto.example"
        ? ok({
            pageUrl: website,
            phone: null,
            hours: null,
            instagram: null,
            address: null,
            imageUrl: host === "semfoto.example" ? null : `https://${host}/img/fachada.jpg`,
          })
        : err("unavailable" as const);
    },
    repo,
    store: createMemoryMediaStore(),
    reproductionEnabled: async () => true,
    now: () => NOW,
    photos,
  };
  return { deps, links, checked, mem };
}

describe("runVenuePhotos", () => {
  it("anexa a foto oficial de quem tem, deixa o cartão tipográfico nos outros e marca todas as tentativas", async () => {
    const { deps, links, checked } = setup(
      [
        { id: "v1", name: "Padaria Pão Dourado", website: "https://paodourado.example/" },
        { id: "v2", name: "Padaria Sem Foto", website: "https://semfoto.example/" },
        { id: "v3", name: "Padaria Baixa", website: "https://baixa.example/" },
      ],
      {
        "https://paodourado.example/robots.txt": { status: 404 },
        "https://paodourado.example/img/fachada.jpg": jpeg("reproducao-1600x900.jpg"),
        "https://semfoto.example/robots.txt": { status: 404 },
        "https://baixa.example/robots.txt": { status: 404 },
        "https://baixa.example/img/fachada.jpg": jpeg("baixa-resolucao-500x281.jpg"),
      },
    );
    const r = await runVenuePhotos(deps);
    expect(r).toEqual({ checked: 3, attached: 1, typographic: { none: 1, low_res: 1 } });
    expect(links).toEqual(["v1"]);
    expect(checked).toEqual(["v1", "v2", "v3"]);
  });

  it("respeita o limite por execução", async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `v${i}`,
      name: `Padaria ${i}`,
      website: "https://semfoto.example/",
    }));
    const { deps, checked } = setup(many, {
      "https://semfoto.example/robots.txt": { status: 404 },
    });
    const r = await runVenuePhotos(deps, { limit: 2 });
    expect(r.checked).toBe(2);
    expect(checked).toHaveLength(2);
  });

  it("sem candidatos não faz nada", async () => {
    const { deps } = setup([], {});
    expect(await runVenuePhotos(deps)).toEqual({ checked: 0, attached: 0, typographic: {} });
  });
});
