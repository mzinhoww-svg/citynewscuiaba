import { describe, expect, it } from "vitest";
import { distanceMeters, isSameVenue, mergeRecord, mergeVenueLists, nameTokens } from "./merge";
import { venueRecord } from "./testing";

const rec = venueRecord;

describe("nameTokens", () => {
  it("tira acento, artigos e o tipo do negócio, mas não esvazia o nome", () => {
    expect(nameTokens("Padaria Pão Dourado")).toEqual(["pao", "dourado"]);
    expect(nameTokens("Café & Cia do Zé")).toEqual(["cia", "ze"]);
    expect(nameTokens("Padaria")).toEqual(["padaria"]);
  });
});

describe("distanceMeters", () => {
  it("0 para o mesmo ponto e perto de 111 m por 0,001 grau de latitude", () => {
    const a = { lat: -15.6, lng: -56.1 };
    expect(distanceMeters(a, a)).toBe(0);
    expect(distanceMeters(a, { lat: -15.601, lng: -56.1 })).toBeGreaterThan(105);
    expect(distanceMeters(a, { lat: -15.601, lng: -56.1 })).toBeLessThan(118);
  });
});

describe("isSameVenue", () => {
  it("nome parecido e a menos de 250 m é o mesmo lugar", () => {
    const a = rec();
    const b = rec({ name: "Pão Dourado", lat: -15.6016, lng: -56.0981 });
    expect(isSameVenue(a, b)).toBe(true);
  });

  it("nome igual mas a quilômetros de distância são lugares diferentes (filiais)", () => {
    expect(isSameVenue(rec(), rec({ lat: -15.65, lng: -56.05 }))).toBe(false);
  });

  it("nomes diferentes no mesmo ponto não se misturam", () => {
    expect(isSameVenue(rec(), rec({ name: "Padaria Estrela do Sul" }))).toBe(false);
  });

  it("id de provedor em comum basta", () => {
    const a = rec({ placeIds: { tripadvisor: "123" } });
    const b = rec({ name: "Outro nome", lat: null, lng: null, placeIds: { tripadvisor: "123" } });
    expect(isSameVenue(a, b)).toBe(true);
  });

  it("sem coordenada precisa do mesmo site ou do mesmo endereço", () => {
    const a = rec({ lat: null, lng: null });
    expect(isSameVenue(a, rec({ lat: null, lng: null }))).toBe(false);
    expect(
      isSameVenue(
        rec({ lat: null, lng: null, website: "https://www.paodourado.example/" }),
        rec({ lat: null, lng: null, website: "https://paodourado.example/contato" }),
      ),
    ).toBe(true);
    expect(
      isSameVenue(
        rec({ lat: null, lng: null, address: "Rua das Flores, 10" }),
        rec({ lat: null, lng: null, address: "rua das flores 10" }),
      ),
    ).toBe(true);
  });
});

describe("mergeRecord", () => {
  it("o que existe ganha, o que falta é preenchido e a nota vem do dado novo", () => {
    const base = rec({
      phone: "+55 65 3000-0000",
      rating: 4.1,
      ratingCount: 10,
      ratingSource: "manual",
    });
    const incoming = rec({
      phone: "+55 65 9999-9999",
      address: "Rua A, 1",
      rating: 4.6,
      ratingCount: 220,
      ratingSource: "tripadvisor",
      tripadvisorRank: 7,
      placeIds: { tripadvisor: "55" },
      sources: ["tripadvisor"],
    });
    const m = mergeRecord(base, incoming);
    expect(m.phone).toBe("+55 65 3000-0000");
    expect(m.address).toBe("Rua A, 1");
    expect(m.rating).toBe(4.6);
    expect(m.ratingCount).toBe(220);
    expect(m.ratingSource).toBe("tripadvisor");
    expect(m.tripadvisorRank).toBe(7);
    expect(m.placeIds).toEqual({ tripadvisor: "55" });
    expect(m.sources.sort()).toEqual(["osm", "tripadvisor"]);
  });

  it("dado novo sem nota não apaga a nota que já existe", () => {
    const base = rec({ rating: 4.5, ratingCount: 100, ratingSource: "tripadvisor" });
    const m = mergeRecord(base, rec());
    expect(m.rating).toBe(4.5);
    expect(m.ratingCount).toBe(100);
  });
});

describe("mergeVenueLists", () => {
  it("junta duplicatas vindas de provedores diferentes e deixa o resto como inserção", () => {
    const osm = rec({ placeIds: { osm: "node/1" } });
    const ta = rec({
      name: "Pão Dourado",
      lat: -15.6015,
      lng: -56.0978,
      rating: 4.7,
      ratingCount: 300,
      ratingSource: "tripadvisor",
      placeIds: { tripadvisor: "9" },
      sources: ["tripadvisor"],
    });
    const other = rec({
      name: "Padaria Lua Nova",
      lat: -15.62,
      lng: -56.12,
      placeIds: { osm: "node/2" },
    });
    const r = mergeVenueLists([], [osm, ta, other]);
    expect(r.updates).toHaveLength(0);
    expect(r.inserts).toHaveLength(2);
    const merged = r.inserts.find((x) => x.placeIds.osm === "node/1")!;
    expect(merged.placeIds.tripadvisor).toBe("9");
    expect(merged.sources.sort()).toEqual(["osm", "tripadvisor"]);
  });

  it("encaixa no existente e devolve só o que mudou", () => {
    const existing = [
      rec({ placeIds: { osm: "node/1" } }),
      rec({ name: "Padaria Lua Nova", lat: -15.62, lng: -56.12 }),
    ];
    const r = mergeVenueLists(existing, [
      rec({ placeIds: { osm: "node/1" }, phone: "+55 65 3333-3333" }),
    ]);
    expect(r.inserts).toHaveLength(0);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0]!.existing).toBe(existing[0]);
    expect(r.updates[0]!.record.phone).toBe("+55 65 3333-3333");
  });

  it("roda duas vezes com o mesmo dado sem criar duplicata", () => {
    const first = mergeVenueLists([], [rec({ placeIds: { osm: "node/1" } })]);
    const second = mergeVenueLists(first.inserts, [rec({ placeIds: { osm: "node/1" } })]);
    expect(second.inserts).toHaveLength(0);
  });
});
