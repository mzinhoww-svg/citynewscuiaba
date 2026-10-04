import { describe, expect, it, vi } from "vitest";
import type { VenueProvider } from "./providers/types";
import { venueRecord } from "./testing";
import { MAX_VERIFY, verifyNames } from "./verify-names";
import { err, ok } from "@/lib/result";
import type { VenueRecord } from "./types";

const osmProvider = (known: VenueRecord[]): VenueProvider => ({
  source: "osm",
  search: async (q) =>
    ok(
      known.filter((k) =>
        k.name.toLowerCase().includes((q.name ?? "").toLowerCase().split(" ")[1] ?? "!"),
      ),
    ),
  details: async () => ok(null),
});

const taProvider = (known: VenueRecord[], details: VenueRecord | null = null): VenueProvider => ({
  source: "tripadvisor",
  search: async () => ok(known),
  details: async () => ok(details),
});

const PAO = venueRecord({ name: "Padaria Pão Dourado", placeIds: { osm: "node/1" } });
const TA_SEARCH = venueRecord({
  name: "Pão Dourado Padaria",
  placeIds: { tripadvisor: "9001" },
  sources: ["tripadvisor"],
});
const TA_FULL = venueRecord({
  name: "Pão Dourado Padaria",
  rating: 4.6,
  ratingCount: 300,
  ratingSource: "tripadvisor",
  tripadvisorRank: 4,
  placeIds: { tripadvisor: "9001" },
  sources: ["tripadvisor"],
});

describe("verifyNames", () => {
  it("nome que existe nos provedores é verificado e traz os dados do provedor", async () => {
    const r = await verifyNames(
      ["Padaria Pão Dourado"],
      [osmProvider([PAO]), taProvider([TA_SEARCH], TA_FULL)],
      {
        area: "Cuiabá",
        category: "padaria",
      },
    );
    expect(r).toHaveLength(1);
    expect(r[0]!.status).toBe("verified");
    expect(r[0]!.providers).toEqual(["osm", "tripadvisor"]);
    expect(r[0]!.record).toMatchObject({
      name: "Padaria Pão Dourado",
      rating: 4.6,
      tripadvisorRank: 4,
      placeIds: { osm: "node/1", tripadvisor: "9001" },
    });
    expect(r[0]!.record!.sources.sort()).toEqual(["osm", "tripadvisor"]);
  });

  it("nome que nenhum provedor reconhece é descartado", async () => {
    const r = await verifyNames(
      ["Padaria Fantasma do Brejo"],
      [osmProvider([PAO]), taProvider([TA_SEARCH])],
      {
        area: "Cuiabá",
      },
    );
    expect(r[0]).toEqual({
      name: "Padaria Fantasma do Brejo",
      status: "not_found",
      record: null,
      providers: [],
    });
  });

  it("achado de nome parecido demais não conta (semelhança mínima)", async () => {
    const other = venueRecord({
      name: "Padaria Dourada Lua Nova Express",
      placeIds: { osm: "node/9" },
    });
    const p: VenueProvider = {
      source: "osm",
      search: async () => ok([other]),
      details: async () => ok(null),
    };
    const r = await verifyNames(["Padaria Pão Dourado"], [p], { area: "Cuiabá" });
    expect(r[0]!.status).toBe("not_found");
  });

  it("provedor sem chave ou com erro é pulado, e o outro basta", async () => {
    const broken: VenueProvider = {
      source: "tripadvisor",
      search: async () => err("no_key" as const),
      details: async () => err("no_key" as const),
    };
    const r = await verifyNames(["Padaria Pão Dourado"], [broken, osmProvider([PAO])], {
      area: "Cuiabá",
    });
    expect(r[0]!.status).toBe("verified");
    expect(r[0]!.providers).toEqual(["osm"]);
  });

  it("todos os provedores fora do ar: ninguém é verificado (nunca por palpite)", async () => {
    const down: VenueProvider = {
      source: "osm",
      search: async () => err("network" as const),
      details: async () => err("network" as const),
    };
    const r = await verifyNames(["Padaria Pão Dourado"], [down], { area: "Cuiabá" });
    expect(r[0]!.status).toBe("not_found");
  });

  it("o nome do portal é só pista: o registro final usa o nome do provedor e a categoria pedida", async () => {
    const r = await verifyNames(["Pão Dourado"], [osmProvider([PAO])], {
      area: "Cuiabá",
      category: "cafeteria",
    });
    expect(r[0]!.record!.name).toBe("Padaria Pão Dourado");
    expect(r[0]!.record!.category).toBe("cafeteria");
  });

  it("confere no máximo 20 nomes por vez", async () => {
    const search = vi.fn(async () => ok<VenueRecord[]>([]));
    const p: VenueProvider = { source: "osm", search, details: async () => ok(null) };
    await verifyNames(
      Array.from({ length: 35 }, (_, i) => `Lugar ${i}`),
      [p],
      { area: "Cuiabá" },
    );
    expect(search).toHaveBeenCalledTimes(MAX_VERIFY);
  });
});
