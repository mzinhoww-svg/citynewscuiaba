import { describe, expect, it } from "vitest";
import {
  eventConfigFromRow,
  eventPatch,
  parseEventSourceForm,
  type EventSourceConfig,
} from "./event-source";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

const VALID = {
  name: "Teatro Cerrado (fictício)",
  baseUrl: "teatro-cerrado.example",
  extractKind: "ai_page",
  eventOrigin: "organizer",
  confirms: "on",
  collectorNotes: "Cada espetáculo tem página própria.\n\n  Ingressos na bilheteria.  ",
  listUrls:
    "https://teatro-cerrado.example/agenda\nhttps://teatro-cerrado.example/agenda?utm_source=x",
  requireCity: "",
  defaultVenue: "Teatro Cerrado",
  defaultNeighborhood: "",
  defaultCategory: "teatro",
};

describe("parseEventSourceForm", () => {
  it("lê o cadastro: URL com esquema, avisos e listagens por linha (sem vazias nem repetidas)", () => {
    const r = parseEventSourceForm(form(VALID), { create: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual({
      name: "Teatro Cerrado (fictício)",
      slug: "teatro-cerrado-ficticio",
      baseUrl: "https://teatro-cerrado.example/",
      config: {
        extractKind: "ai_page",
        origin: "organizer",
        confirms: true,
        notes: ["Cada espetáculo tem página própria.", "Ingressos na bilheteria."],
        listUrls: ["https://teatro-cerrado.example/agenda"],
        requireCity: false,
        defaultVenue: "Teatro Cerrado",
        defaultNeighborhood: null,
        defaultCategory: "teatro",
      },
    });
  });

  it("erros por campo: nome, tipo de extração, origem, URL, categoria e listagem inválida", () => {
    const r = parseEventSourceForm(
      form({
        ...VALID,
        name: " ",
        extractKind: "pdf",
        eventOrigin: "reader",
        baseUrl: "ftp://x.example",
        defaultCategory: "Show!",
        listUrls: "nao e url",
      }),
      { create: true },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.error).sort()).toEqual(
      ["baseUrl", "defaultCategory", "eventOrigin", "extractKind", "listUrls", "name"].sort(),
    );
  });

  it("limites: até 10 avisos de até 300 caracteres e 10 listagens", () => {
    const many = Array.from({ length: 11 }, (_, i) => `Aviso ${i}`).join("\n");
    const r = parseEventSourceForm(form({ ...VALID, collectorNotes: many }), { create: true });
    expect(r.ok).toBe(false);
    const long = parseEventSourceForm(form({ ...VALID, collectorNotes: "x".repeat(301) }), {
      create: true,
    });
    expect(long.ok).toBe(false);
  });

  it("edição não lê nome de URL nem slug (identidade da fonte)", () => {
    const r = parseEventSourceForm(form({ ...VALID, baseUrl: "" }), { create: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.baseUrl).toBeNull();
  });
});

describe("eventConfigFromRow e eventPatch", () => {
  const row = {
    extract_kind: "tribe",
    event_origin: "official",
    confirms: true,
    collector_notes: ["a"],
    list_urls: [],
    require_city: true,
    default_venue: null,
    default_neighborhood: "Centro",
    default_category: null,
  };

  it("linha do banco → configuração", () => {
    expect(eventConfigFromRow(row)).toEqual({
      extractKind: "tribe",
      origin: "official",
      confirms: true,
      notes: ["a"],
      listUrls: [],
      requireCity: true,
      defaultVenue: null,
      defaultNeighborhood: "Centro",
      defaultCategory: null,
    });
  });

  it("patch só com o que mudou (camelCase do store)", () => {
    const before = eventConfigFromRow(row);
    const after: EventSourceConfig = { ...before, confirms: false, notes: ["a", "b"] };
    expect(eventPatch(before, after)).toEqual({ confirms: false, collectorNotes: ["a", "b"] });
    expect(eventPatch(before, before)).toEqual({});
  });
});
