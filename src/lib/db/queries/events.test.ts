import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { featuredFirst, toEventView, type EventSourceNames } from "./events";

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
  organizer: null,
  featured_until: null,
  media_id: null,
  media: null,
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

describe("toEventView imagem pelo Media Registry (ARD-T4)", () => {
  const now = new Date("2026-10-08T15:00:00Z");
  const asset = (p: Partial<NonNullable<Row["media"]>> = {}): NonNullable<Row["media"]> => ({
    id: "a0000000-0000-4000-8000-000000000001",
    kind: "reproduction",
    status: "approved",
    origin_url: "https://cdn.teatro.example/cartaz.jpg",
    page_url: "https://teatro.example/evento/show",
    source_id: null,
    source_name: "Teatro Exemplo",
    credit: "Teatro Exemplo",
    license_until: null,
    removed_at: null,
    rights_status: "unknown",
    ...p,
  });

  it("ativo aprovado: variantes 480 e 960 da rota própria, crédito da fonte e link da página", () => {
    const v = toEventView(row({ media_id: asset().id, media: asset() }), names, now);
    expect(v.image).toEqual({
      src: `/api/media/${asset().id}`,
      alt: "Imagem de divulgação: Show",
      kind: "reproduction",
      credit: "Teatro Exemplo",
      originUrl: "https://teatro.example/evento/show",
    });
  });

  it("sem fonte gravada, o crédito é o site da página (nunca o host da CDN)", () => {
    const v = toEventView(row({ media: asset({ source_name: null, credit: null }) }), names, now);
    expect(v.image?.credit).toBe("teatro.example");
  });

  it("bloqueado, retirado, vencido, não aprovado ou invisível (RLS) → sem imagem", () => {
    for (const media of [
      asset({ status: "blocked" }),
      asset({ removed_at: "2026-10-07T10:00:00Z" }),
      asset({ license_until: "2026-10-07" }),
      asset({ rights_status: "blocked" }),
      asset({ rights_status: "expired" }),
      asset({ status: "pending" }),
      null,
    ]) {
      expect(toEventView(row({ media }), names, now).image).toBeNull();
    }
  });

  it("legenda completa ou nada: reprodução sem página de origem ou sem nome de crédito não sai", () => {
    expect(toEventView(row({ media: asset({ page_url: null }) }), names, now).image).toBeNull();
    expect(
      toEventView(
        row({ media: asset({ page_url: "nao-e-url", source_name: null, credit: null }) }),
        names,
        now,
      ).image,
    ).toBeNull();
  });

  it("validade que vence hoje ainda vale (como media_rights_status_for: anterior a hoje)", () => {
    expect(
      toEventView(row({ media: asset({ license_until: "2026-10-08" }) }), names, now).image,
    ).not.toBeNull();
  });

  it("organizador aparado; vazio vira null", () => {
    expect(toEventView(row({ organizer: "  Coletivo Siriri " }), names, now).organizer).toBe(
      "Coletivo Siriri",
    );
    expect(toEventView(row({ organizer: "  " }), names, now).organizer).toBeNull();
  });

  it("destaque só com featured_until ≥ agora", () => {
    expect(toEventView(row({ featured_until: "2026-10-09T03:59:59Z" }), names, now).featured).toBe(
      true,
    );
    expect(toEventView(row({ featured_until: "2026-10-08T14:59:59Z" }), names, now).featured).toBe(
      false,
    );
    expect(toEventView(row({ featured_until: null }), names, now).featured).toBe(false);
  });
});

describe("featuredFirst (home, ARD-T4)", () => {
  const ev = (id: string, featured = false) =>
    ({ id, featured }) as unknown as ReturnType<typeof toEventView>;

  it("até 3 destacados antes dos demais, sem repetir, no limite pedido", () => {
    const featured = [ev("f1", true), ev("f2", true), ev("f3", true), ev("f4", true)];
    const upcoming = [ev("a"), ev("f2", true), ev("b"), ev("c")];
    expect(featuredFirst(featured, upcoming, 3).map((e) => e.id)).toEqual(["f1", "f2", "f3"]);
    expect(featuredFirst(featured.slice(0, 1), upcoming, 3).map((e) => e.id)).toEqual([
      "f1",
      "a",
      "f2",
    ]);
    expect(featuredFirst([], upcoming, 2).map((e) => e.id)).toEqual(["a", "f2"]);
  });
});
