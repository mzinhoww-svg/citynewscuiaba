import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { toEventView, type EventSourceNames } from "./events";

type Row = Parameters<typeof toEventView>[0];

const row = (p: Partial<Row>): Row => ({
  id: "e1",
  slug: "show",
  title: "Show",
  starts_at: "2026-10-16T20:00:00-04:00",
  ends_at: null,
  venue: "Teatro Exemplo",
  neighborhood: null,
  price_cents: null,
  is_free: true,
  age_rating: "livre",
  category: "musica",
  accessibility: null,
  origin: "organizer",
  confirmed_at: "2026-10-08T10:00:00Z",
  description: null,
  source_url: null,
  price_unknown: false,
  source_ref: null,
  confirmed_by_source_id: null,
  venue_id: null,
  ...p,
});

const names: EventSourceNames = new Map([
  ["s-discovery", { name: "Agenda Cuiabana", confirms: false }],
  ["s-house", { name: "Teatro Exemplo", confirms: true }],
]);

describe("toEventView origem e confirmação", () => {
  it("fonte de descoberta sem confirmação: não confirmado", () => {
    const v = toEventView(row({ source_ref: "s-discovery" }), names);
    expect(v).toMatchObject({
      sourceName: "Agenda Cuiabana",
      confirmedByName: null,
      confirmed: false,
    });
  });

  it("fonte de descoberta confirmada por outra fonte: confirmado, com o nome de quem confirmou", () => {
    const v = toEventView(
      row({ source_ref: "s-discovery", confirmed_by_source_id: "s-house" }),
      names,
    );
    expect(v).toMatchObject({
      sourceName: "Agenda Cuiabana",
      confirmedByName: "Teatro Exemplo",
      confirmed: true,
    });
  });

  it("fonte que confirma (casa): confirmado, sem 'confirmado por'", () => {
    const v = toEventView(row({ source_ref: "s-house" }), names);
    expect(v).toMatchObject({
      sourceName: "Teatro Exemplo",
      confirmedByName: null,
      confirmed: true,
    });
  });

  it("oficial e redação contam como confirmados; redação mantém a origem newsroom", () => {
    expect(toEventView(row({ origin: "official" }), names).confirmed).toBe(true);
    const n = toEventView(row({ origin: "newsroom" }), names);
    expect(n).toMatchObject({ origin: "newsroom", confirmed: true, sourceName: null });
  });

  it("sem fonte conhecida (cadastro da casa ou sugestão de leitor): sem nomes", () => {
    const v = toEventView(row({ origin: "reader" }), names);
    expect(v).toMatchObject({ origin: "reader", sourceName: null, confirmedByName: null });
  });
});

describe("toEventView lugar do Guia", () => {
  it("lugar ativo vinculado: slug do Guia; sem vínculo, inativo ou oculto pela RLS: null", () => {
    const venueId = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
    expect(
      toEventView(
        row({ venue_id: venueId, guide_venue: { slug: "teatro-exemplo", status: "active" } }),
      ).venueSlug,
    ).toBe("teatro-exemplo");
    expect(toEventView(row({})).venueSlug).toBeNull();
    expect(
      toEventView(row({ venue_id: venueId, guide_venue: { slug: "fechado", status: "inactive" } }))
        .venueSlug,
    ).toBeNull();
    expect(toEventView(row({ venue_id: venueId, guide_venue: null })).venueSlug).toBeNull();
  });
});
