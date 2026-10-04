import { describe, expect, it } from "vitest";
import { canAutoPublish } from "./auto-publish";
import {
  autoPublishCheck,
  draftOf,
  eligibleFor,
  isVerified,
  proposeFromLink,
  proposeFromTemplate,
} from "./proposals";
import { venue } from "./testing";
import type { GuideTemplate } from "./types";

const TPL: GuideTemplate = {
  slug: "padarias-cuiaba",
  title: "As 5 melhores padarias de Cuiabá",
  noun: "padarias",
  category: "padaria",
  subcategory: null,
  neighborhood: null,
  take: 5,
  minVenues: 5,
};

/** 8 padarias com notas diferentes (a de índice 0 é a melhor). */
const pool = () =>
  [4.9, 4.8, 4.7, 4.6, 4.5, 4.4, 4.3, 4.2].map((rating, i) =>
    venue({
      name: `Padaria Modelo ${String.fromCharCode(65 + i)}`,
      rating,
      ratingCount: 400,
      tripadvisorRank: i + 1,
    }),
  );

describe("proposeFromTemplate", () => {
  it("propõe os 5 lugares mais bem pontuados, cada um com 2+ fontes de dados", () => {
    const venues = pool();
    const p = proposeFromTemplate(TPL, [...venues].reverse());
    expect(p.origin).toBe("template");
    expect(p.items.map((i) => i.position)).toEqual([1, 2, 3, 4, 5]);
    expect(p.items.map((i) => i.venueId)).toEqual(venues.slice(0, 5).map((v) => v.id));
    expect(p.items.every((i) => i.score > 0)).toBe(true);
    for (const i of p.items) {
      const v = venues.find((x) => x.id === i.venueId)!;
      expect(new Set(v.sources).size).toBeGreaterThanOrEqual(2);
    }
    expect(p.title).toBe(TPL.title);
    expect(p.slug).toBe("padarias-cuiaba");
    expect(p.dataSources.sort()).toEqual(["osm", "tripadvisor"]);
  });

  it("lugar com uma fonte só, suspenso, inativo ou de outra categoria nunca entra", () => {
    const good = pool().slice(0, 5);
    const bad = [
      venue({
        name: "Padaria Uma Fonte",
        sources: ["osm"],
        rating: 5,
        ratingCount: 9000,
        tripadvisorRank: 1,
      }),
      venue({ name: "Padaria Suspensa", status: "suspended", rating: 5, ratingCount: 9000 }),
      venue({ name: "Padaria Inativa", status: "inactive", rating: 5, ratingCount: 9000 }),
      venue({ name: "Bar Outra Categoria", category: "bar", rating: 5, ratingCount: 9000 }),
    ];
    const p = proposeFromTemplate(TPL, [...bad, ...good]);
    expect(p.items.map((i) => i.venueId).sort()).toEqual(good.map((v) => v.id).sort());
    for (const b of bad) expect(eligibleFor(TPL, b)).toBe(false);
  });

  it("modelo por bairro e por cozinha filtra", () => {
    const vs = [
      venue({ neighborhood: "Coxipó", subcategory: "italiana", category: "restaurante" }),
      venue({ neighborhood: "Centro Norte", subcategory: "italiana", category: "restaurante" }),
      venue({ neighborhood: "Coxipó", subcategory: "japonesa", category: "restaurante" }),
    ];
    const t: GuideTemplate = {
      ...TPL,
      slug: "italianos-coxipo",
      title: "Os 3 melhores restaurantes italianos do Coxipó",
      noun: "restaurantes italianos",
      category: "restaurante",
      subcategory: "italiana",
      neighborhood: "Coxipó",
      take: 3,
    };
    const p = proposeFromTemplate(t, vs);
    expect(p.items.map((i) => i.venueId)).toEqual([vs[0]!.id]);
    expect(p.criteria).toContain("Coxipó");
  });

  it("menções nas nossas matérias sobem o lugar", () => {
    const [a, b, ...rest] = pool();
    const mentions = new Map([[b!.id, 6]]);
    const without = proposeFromTemplate({ ...TPL, take: 2 }, [a!, b!, ...rest]);
    const withM = proposeFromTemplate({ ...TPL, take: 2 }, [a!, b!, ...rest], { mentions });
    expect(without.items[0]!.venueId).toBe(a!.id);
    expect(withM.items.find((i) => i.venueId === b!.id)!.score).toBeGreaterThan(
      without.items.find((i) => i.venueId === b!.id)!.score,
    );
  });

  it("o critério só cita os sinais que a lista de fato usou", () => {
    const noRank = Array.from({ length: 5 }, () => venue({ tripadvisorRank: null }));
    expect(proposeFromTemplate(TPL, noRank).criteria).not.toMatch(/TripAdvisor/);
    expect(proposeFromTemplate(TPL, pool()).criteria).toMatch(/TripAdvisor/);
  });

  it("sem lugares suficientes devolve menos itens, e canAutoPublish recusa", () => {
    const vs = pool().slice(0, 4);
    const p = proposeFromTemplate(TPL, vs);
    expect(p.items).toHaveLength(4);
    const check = autoPublishCheck(TPL, p, vs);
    expect(check.ok).toBe(false);
    expect(check.missing).toContain("min_venues");
  });

  it("lista completa de modelo passa em canAutoPublish", () => {
    const vs = pool();
    const p = proposeFromTemplate(TPL, vs);
    expect(autoPublishCheck(TPL, p, vs)).toEqual({ ok: true, missing: [] });
  });

  it("lugar sem provedor que o reconheça não conta como verificado", () => {
    const v = venue({ placeIds: {}, sources: ["manual", "site"] });
    expect(isVerified(v)).toBe(false);
    const vs = [...pool().slice(0, 4), v];
    const p = proposeFromTemplate(TPL, vs);
    expect(canAutoPublish(draftOf(p, vs), 5).missing).toContain("min_venues");
  });
});

describe("proposeFromLink", () => {
  const extracted = {
    names: [
      "Padaria Modelo A",
      "Padaria Modelo B",
      "Padaria Modelo C",
      "Padaria Fantasma",
      "Padaria Modelo D",
    ],
    category: "padaria",
    criteria: "votacao popular",
    notes: ["5 nomes encontrados na lista original."],
  };

  it("monta a lista do CityNews com ordem e critério nossos e registra o que foi descartado", () => {
    const vs = pool().slice(0, 4);
    const r = proposeFromLink({
      url: "https://www.saboresmt.example/melhores-padarias",
      extracted,
      verifiedNames: vs.map((v) => v.name),
      venues: vs,
    });
    if (!r.ok) throw new Error("falhou");
    expect(r.proposal.origin).toBe("link");
    expect(r.proposal.title).toBe("As 4 melhores padarias de Cuiabá");
    expect(r.proposal.items.map((i) => i.venueId)).toEqual(vs.map((v) => v.id));
    expect(r.proposal.criteria).toMatch(/Reunimos padarias de Cuiabá/);
    expect(r.analysis).toEqual({
      sourceHost: "saboresmt.example",
      extractedNames: extracted.names,
      verifiedNames: vs.map((v) => v.name),
      discardedNames: ["Padaria Fantasma"],
      criteriaKind: "votacao popular",
      notes: extracted.notes,
    });
  });

  it("proposta por link nunca publica sozinha", () => {
    const vs = pool();
    const r = proposeFromLink({
      url: "https://x.example/a",
      extracted,
      verifiedNames: vs.map((v) => v.name),
      venues: vs,
    });
    if (!r.ok) throw new Error("falhou");
    expect(autoPublishCheck({ minVenues: 3 }, r.proposal, vs).missing).toContain("needs_human");
  });

  it("menos de 3 lugares verificados não vira lista", () => {
    const vs = pool().slice(0, 2);
    expect(
      proposeFromLink({
        url: "https://x.example/a",
        extracted,
        verifiedNames: vs.map((v) => v.name),
        venues: vs,
      }),
    ).toEqual({ ok: false, error: "too_few_verified" });
  });

  it("o artigo do título concorda com o gênero (os bares, as padarias)", () => {
    const bars = Array.from({ length: 5 }, () => venue({ category: "bar" }));
    const r = proposeFromLink({
      url: "https://x.example/a",
      extracted: { ...extracted, category: "bar" },
      verifiedNames: [],
      venues: bars,
    });
    expect(r.ok && r.proposal.title).toBe("Os 5 melhores bares de Cuiabá");
  });
});
