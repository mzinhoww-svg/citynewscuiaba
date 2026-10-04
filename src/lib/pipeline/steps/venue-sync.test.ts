import { describe, expect, it, vi } from "vitest";
import type { SiteFacts } from "@/lib/guide/providers/site";
import type { VenueProvider } from "@/lib/guide/providers/types";
import { venueRecord } from "@/lib/guide/testing";
import type { VenueRecord } from "@/lib/guide/types";
import { err, ok } from "@/lib/result";
import {
  runVenueSync,
  type StoredVenue,
  type VenueSyncDeps,
  type VenueSyncStore,
} from "./venue-sync";

const NOW = new Date("2026-10-03T12:00:00Z");

function memoryStore(initial: StoredVenue[] = []) {
  const rows = [...initial];
  const saves: { inserts: number; updates: { id: string; ratingChecked: boolean }[] }[] = [];
  const store: VenueSyncStore = {
    async loadCategory(category) {
      return rows.filter((r) => r.category === category);
    },
    async staleRatings(before, limit) {
      return rows
        .filter(
          (r) =>
            r.placeIds.tripadvisor && (!r.ratingUpdatedAt || new Date(r.ratingUpdatedAt) < before),
        )
        .slice(0, limit);
    },
    async save(changes, at) {
      saves.push({
        inserts: changes.inserts.length,
        updates: changes.updates.map((u) => ({ id: u.id, ratingChecked: u.ratingChecked })),
      });
      for (const rec of changes.inserts) {
        rows.push({
          ...rec,
          id: `id-${rows.length + 1}`,
          slug: `slug-${rows.length + 1}`,
          status: "active",
          dataUpdatedAt: at.toISOString(),
          ratingUpdatedAt: rec.sources.includes("tripadvisor") ? at.toISOString() : null,
        });
      }
      for (const u of changes.updates) {
        const i = rows.findIndex((r) => r.id === u.id);
        rows[i] = {
          ...rows[i]!,
          ...u.record,
          dataUpdatedAt: at.toISOString(),
          ratingUpdatedAt: u.ratingChecked ? at.toISOString() : rows[i]!.ratingUpdatedAt,
        };
      }
      return { inserted: changes.inserts.length, updated: changes.updates.length };
    },
  };
  return { store, rows, saves };
}

const OSM_REC = venueRecord({
  name: "Padaria Pão Dourado",
  website: "https://paodourado.example",
  placeIds: { osm: "node/1" },
});
const OSM_REC_2 = venueRecord({
  name: "Padaria Lua Nova",
  lat: -15.62,
  lng: -56.12,
  placeIds: { osm: "node/2" },
});
const TA_SEARCH = venueRecord({
  name: "Pão Dourado",
  placeIds: { tripadvisor: "9001" },
  sources: ["tripadvisor"],
});
const TA_DETAILS = venueRecord({
  name: "Pão Dourado",
  lat: -15.6015,
  lng: -56.0975,
  rating: 4.6,
  ratingCount: 310,
  ratingSource: "tripadvisor",
  tripadvisorRank: 5,
  tripadvisorUrl: "https://www.tripadvisor.com.br/x",
  placeIds: { tripadvisor: "9001" },
  sources: ["tripadvisor"],
});

function provider(
  over: Partial<VenueProvider> & { source: VenueProvider["source"] },
): VenueProvider {
  return {
    search: async () => ok([]),
    details: async () => ok(null),
    ...over,
  };
}

function deps(over: Partial<VenueSyncDeps> & { store: VenueSyncStore }): VenueSyncDeps {
  let made = 0;
  return {
    osm: provider({ source: "osm", search: async () => ok([OSM_REC, OSM_REC_2]) }),
    tripadvisor: provider({
      source: "tripadvisor",
      search: async () => {
        made += 1;
        return ok([TA_SEARCH]);
      },
      details: async () => {
        made += 1;
        return ok(TA_DETAILS);
      },
    }),
    site: async () =>
      ok<SiteFacts>({
        pageUrl: "https://paodourado.example/",
        phone: "+55 65 3000-1111",
        hours: "Mo-Sa 06:00-20:00",
        instagram: "https://www.instagram.com/paodourado",
        address: null,
        imageUrl: null,
      }),
    now: () => NOW,
    taCallsLeft: async () => 100,
    taCallsMade: () => made,
    ...over,
  };
}

const PLAN = { categories: [{ category: "padaria" }], area: "Cuiabá" };

describe("runVenueSync", () => {
  it("junta OSM, TripAdvisor e site oficial num só lugar com as três fontes", async () => {
    const { store, rows } = memoryStore();
    const report = await runVenueSync(deps({ store }), PLAN);
    expect(report.providers).toEqual({ osm: "ok", tripadvisor: "ok", site: "ok" });
    expect(rows).toHaveLength(2);
    const pao = rows.find((r) => r.placeIds.osm === "node/1")!;
    expect(pao.placeIds.tripadvisor).toBe("9001");
    expect(pao.rating).toBe(4.6);
    expect(pao.tripadvisorRank).toBe(5);
    expect(pao.phone).toBe("+55 65 3000-1111");
    expect(pao.sources.sort()).toEqual(["osm", "site", "tripadvisor"]);
    expect(report.taCalls).toBe(2);
    expect(report.categories[0]).toMatchObject({ osm: 2, tripadvisor: 1, inserted: 2 });
  });

  it("sem chave do TripAdvisor segue só com OSM e site e avisa no relatório", async () => {
    const { store, rows } = memoryStore();
    const report = await runVenueSync(deps({ store, tripadvisor: null }), PLAN);
    expect(report.providers.tripadvisor).toBe("no_key");
    expect(report.taCalls).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.rating === null)).toBe(true);
  });

  it("respeita o limite diário de chamadas ao TripAdvisor", async () => {
    const { store } = memoryStore();
    const d = deps({ store, taCallsLeft: async () => 1 });
    const report = await runVenueSync(d, PLAN);
    // Só a busca cabia; os detalhes ficam para amanhã.
    expect(report.taCalls).toBe(1);
    expect(report.providers.tripadvisor).toBe("budget");
    expect(report.categories[0]!.tripadvisor).toBe(0);
  });

  it("limite zero não chama o TripAdvisor nenhuma vez", async () => {
    const { store } = memoryStore();
    const search = vi.fn(async () => ok<VenueRecord[]>([]));
    const report = await runVenueSync(
      deps({
        store,
        taCallsLeft: async () => 0,
        tripadvisor: provider({ source: "tripadvisor", search }),
      }),
      PLAN,
    );
    expect(search).not.toHaveBeenCalled();
    expect(report.providers.tripadvisor).toBe("budget");
  });

  it("chave recusada (401) desliga o TripAdvisor na execução, e o OSM continua", async () => {
    const { store, rows } = memoryStore();
    const details = vi.fn(async () => err("unauthorized" as const));
    const report = await runVenueSync(
      deps({
        store,
        tripadvisor: provider({
          source: "tripadvisor",
          search: async () => ok([TA_SEARCH]),
          details,
        }),
      }),
      { categories: [{ category: "padaria" }, { category: "bar" }], area: "Cuiabá" },
    );
    expect(report.providers.tripadvisor).toBe("error:unauthorized");
    expect(details).toHaveBeenCalledTimes(1);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("falha do OSM é registrada e não derruba o passo", async () => {
    const { store } = memoryStore();
    const report = await runVenueSync(
      deps({
        store,
        osm: provider({ source: "osm", search: async () => err("rate_limited" as const) }),
      }),
      PLAN,
    );
    expect(report.providers.osm).toBe("error:rate_limited");
  });

  it("rodar duas vezes com os mesmos dados não duplica lugares", async () => {
    const { store, rows } = memoryStore();
    await runVenueSync(deps({ store }), PLAN);
    const second = await runVenueSync(deps({ store }), PLAN);
    expect(rows).toHaveLength(2);
    expect(second.categories[0]!.inserted).toBe(0);
  });

  it("site que bloqueia o robô é contado e o lugar fica sem dados do site", async () => {
    const { store, rows } = memoryStore();
    const report = await runVenueSync(
      deps({ store, tripadvisor: null, site: async () => err("robots" as const) }),
      PLAN,
    );
    expect(report.sitesBlocked).toBe(1);
    expect(rows.find((r) => r.placeIds.osm === "node/1")!.sources).not.toContain("site");
  });

  it("lê no máximo `maxSites` sites por execução", async () => {
    const { store } = memoryStore();
    const site = vi.fn(async () => err("http" as const));
    const many = Array.from({ length: 6 }, (_, i) =>
      venueRecord({
        name: `Padaria Teste ${i}`,
        lat: -15.6 - i / 100,
        website: `https://p${i}.example`,
        placeIds: { osm: `node/${i}` },
      }),
    );
    await runVenueSync(
      deps({
        store,
        tripadvisor: null,
        site,
        osm: provider({ source: "osm", search: async () => ok(many) }),
      }),
      { ...PLAN, maxSites: 3 },
    );
    expect(site).toHaveBeenCalledTimes(3);
  });

  it("refaz a nota de quem passou de 30 dias e só dentro da cota", async () => {
    const old: StoredVenue = {
      ...OSM_REC,
      id: "v1",
      slug: "pao",
      status: "active",
      dataUpdatedAt: "2026-08-01T00:00:00Z",
      ratingUpdatedAt: "2026-08-01T00:00:00Z",
      rating: 4.0,
      ratingCount: 50,
      ratingSource: "tripadvisor",
      placeIds: { osm: "node/1", tripadvisor: "9001" },
      sources: ["osm", "tripadvisor"],
    };
    const fresh: StoredVenue = {
      ...old,
      id: "v2",
      slug: "fresh",
      ratingUpdatedAt: "2026-09-30T00:00:00Z",
      placeIds: { osm: "node/2", tripadvisor: "9002" },
    };
    const { store, rows, saves } = memoryStore([old, fresh]);
    const report = await runVenueSync(
      deps({
        store,
        osm: provider({ source: "osm" }),
        tripadvisor: provider({ source: "tripadvisor", details: async () => ok(TA_DETAILS) }),
      }),
      { categories: [], area: "Cuiabá" },
    );
    expect(report.refreshed).toBe(1);
    expect(rows.find((r) => r.id === "v1")!.rating).toBe(4.6);
    expect(rows.find((r) => r.id === "v1")!.ratingUpdatedAt).toBe(NOW.toISOString());
    expect(rows.find((r) => r.id === "v2")!.rating).toBe(4.0);
    expect(saves.at(-1)!.updates).toEqual([{ id: "v1", ratingChecked: true }]);
  });
});
