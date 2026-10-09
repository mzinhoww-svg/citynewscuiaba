import { describe, expect, it } from "vitest";
import { STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";
import { EVENT_FORM_FIELDS, eventFormValues, parseEventForm, toLocalInput } from "./event-form";

const NOW = new Date("2026-10-08T15:00:00Z");

function form(over: Record<string, string> = {}): FormData {
  const base: Record<string, string> = {
    title: "Noite do Siriri",
    startsAt: "2026-10-17T20:00",
    endsAt: "2026-10-17T23:30",
    venue: "Casa Cerrado Vivo",
    neighborhood: "Centro Sul",
    price: "40",
    category: "musica",
    ageRating: "livre",
    accessibility: "Rampa de acesso",
    link: "https://cerradovivo.example/siriri",
    description: "Roda de siriri com grupos do Porto. Entrada pelo portão lateral.",
  };
  const f = new FormData();
  for (const [k, v] of Object.entries({ ...base, ...over })) f.set(k, v);
  return f;
}

const parse = (over: Record<string, string> = {}, mode: "create" | "edit" = "create") =>
  parseEventForm(form(over), { now: NOW, mode });

describe("parseEventForm", () => {
  it("lugar do Guia: sem o campo = automático; uuid = escolha da redação; 'nenhum' = sem vínculo", () => {
    const auto = parse();
    expect(auto.ok && auto.value.venueId).toBeUndefined();
    expect(auto.ok && auto.value.venueAuto).toBeUndefined();
    const vazio = parse({ venueId: "" });
    expect(vazio.ok && vazio.value.venueId).toBeUndefined();
    // Campo presente e vazio = "Automático pelo local" escolhido (destrava um vínculo travado).
    expect(vazio.ok && vazio.value.venueAuto).toBe(true);
    const id = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
    const escolhido = parse({ venueId: id });
    expect(escolhido.ok && escolhido.value.venueId).toBe(id);
    const nenhum = parse({ venueId: "nenhum" });
    expect(nenhum.ok && nenhum.value.venueId).toBeNull();
    const lixo = parse({ venueId: "x'; drop" });
    expect(lixo.ok && lixo.value.venueId).toBeUndefined();
  });

  it("aceita o evento completo e converte a hora de Cuiabá e o preço", () => {
    const r = parse();
    expect(r).toEqual({
      ok: true,
      value: {
        title: "Noite do Siriri",
        startsAt: "2026-10-18T00:00:00.000Z",
        endsAt: "2026-10-18T03:30:00.000Z",
        venue: "Casa Cerrado Vivo",
        neighborhood: "Centro Sul",
        priceCents: 4000,
        priceUnknown: false,
        category: "musica",
        ageRating: "livre",
        accessibility: "Rampa de acesso",
        sourceUrl: "https://cerradovivo.example/siriri",
        description: "Roda de siriri com grupos do Porto. Entrada pelo portão lateral.",
        organizer: null,
      },
    });
  });

  it("organizador opcional, aparado; mais de 160 caracteres é recusado", () => {
    const r = parse({ organizer: "  Coletivo   Siriri do Porto " });
    expect(r.ok && r.value.organizer).toBe("Coletivo Siriri do Porto");
    const vazio = parse({ organizer: " " });
    expect(vazio.ok && vazio.value.organizer).toBeNull();
    const longo = parse({ organizer: "x".repeat(161) });
    expect(longo.ok).toBe(false);
    if (!longo.ok) expect(longo.error.organizer).toBe(T.errors.organizer);
  });

  it("recusa fim antes do início", () => {
    const r = parse({ endsAt: "2026-10-17T19:00" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.endsAt).toBe(T.errors.endsAt);
  });

  it("aceita fim igual ao início e campos opcionais vazios", () => {
    const r = parse({
      endsAt: "2026-10-17T20:00",
      neighborhood: "",
      accessibility: "",
      link: "",
      description: "",
    });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value).toMatchObject({
        neighborhood: null,
        accessibility: null,
        sourceUrl: null,
        description: null,
      });
  });

  it("recusa link http e encurtador", () => {
    const http = parse({ link: "http://cerradovivo.example/siriri" });
    expect(http.ok).toBe(false);
    if (!http.ok) expect(http.error.link).toBe(T.errors.link);
    const short = parse({ link: "https://bit.ly/3abc" });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error.link).toBe(T.errors.link);
  });

  it("recusa descrição com 3 frases ou mais de 300 caracteres", () => {
    const three = parse({ description: "Primeira frase. Segunda frase! Terceira frase?" });
    expect(three.ok).toBe(false);
    if (!three.ok) expect(three.error.description).toBe(T.errors.description);
    const long = parse({ description: `${"a".repeat(301)}` });
    expect(long.ok).toBe(false);
  });

  it('aceita "não informado" → priceCents null, priceUnknown true', () => {
    const box = parse({ price: "", priceUnknown: "1" });
    expect(box.ok && box.value).toMatchObject({ priceCents: null, priceUnknown: true });
    const typed = parse({ price: "não informado" });
    expect(typed.ok && typed.value).toMatchObject({ priceCents: null, priceUnknown: true });
  });

  it("preço 0 é gratuito; R$ e centavos com vírgula valem; texto solto não", () => {
    expect(parse({ price: "0" }).ok && parse({ price: "0" })).toMatchObject({
      value: { priceCents: 0, priceUnknown: false },
    });
    const brl = parse({ price: "R$ 1.250,50" });
    expect(brl.ok && brl.value.priceCents).toBe(125050);
    const bad = parse({ price: "barato" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.price).toBe(T.errors.price);
    const empty = parse({ price: "" });
    expect(empty.ok).toBe(false);
  });

  it("título de 3 a 140 caracteres, sem palavrão", () => {
    const short = parse({ title: "ab" });
    expect(!short.ok && short.error.title).toBe(T.errors.title);
    const long = parse({ title: "a".repeat(141) });
    expect(!long.ok && long.error.title).toBe(T.errors.title);
    const rude = parse({ title: "Show da porra" });
    expect(!rude.ok && rude.error.title).toBe(T.errors.profanity);
  });

  it("início obrigatório e futuro no cadastro; na edição pode estar no passado", () => {
    const none = parse({ startsAt: "" });
    expect(!none.ok && none.error.startsAt).toBe(T.errors.startsAt);
    const past = parse({ startsAt: "2026-10-01T20:00", endsAt: "" });
    expect(!past.ok && past.error.startsAt).toBe(T.errors.startsPast);
    expect(parse({ startsAt: "2026-10-01T20:00", endsAt: "" }, "edit").ok).toBe(true);
  });

  it("local obrigatório; categoria e faixa etária só da lista", () => {
    const r = parse({ venue: " ", category: "palestra", ageRating: "21" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.venue).toBe(T.errors.venue);
      expect(r.error.category).toBe(T.errors.category);
      expect(r.error.ageRating).toBe(T.errors.ageRating);
    }
    expect(parse({ ageRating: "consulte" }).ok).toBe(true);
  });

  it("os nomes dos campos do formulário são estáveis", () => {
    expect(EVENT_FORM_FIELDS).toContain("priceUnknown");
    expect(EVENT_FORM_FIELDS).toContain("link");
  });
});

describe("toLocalInput", () => {
  it("instante → valor de datetime-local no relógio de Cuiabá", () => {
    expect(toLocalInput("2026-10-18T00:00:00.000Z")).toBe("2026-10-17T20:00");
    expect(toLocalInput(null)).toBe("");
  });
});

describe("eventFormValues", () => {
  const stored = {
    title: "Noite do Siriri",
    starts_at: "2026-10-18T00:00:00+00:00",
    ends_at: null,
    venue: "Casa Cerrado Vivo",
    neighborhood: null,
    price_cents: 2550,
    price_unknown: false,
    category: "musica",
    age_rating: "livre",
    accessibility: null,
    source_url: null,
    description: null,
    organizer: null,
    venue_id: null,
    locked_fields: [] as string[],
  };

  it("organizador e lugar do Guia: escolha travada volta escolhida; vínculo automático = automático", () => {
    expect(eventFormValues({ ...stored, organizer: "Coletivo" }).organizer).toBe("Coletivo");
    const id = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
    expect(eventFormValues({ ...stored, venue_id: id }).venueId).toBe("");
    expect(eventFormValues({ ...stored, venue_id: id, locked_fields: ["venue_id"] }).venueId).toBe(
      id,
    );
    expect(eventFormValues({ ...stored, locked_fields: ["venue_id"] }).venueId).toBe("nenhum");
  });

  it("preço em reais com vírgula e caixa desmarcada", () => {
    expect(eventFormValues(stored)).toMatchObject({
      startsAt: "2026-10-17T20:00",
      endsAt: "",
      price: "25,50",
      priceUnknown: "",
    });
    expect(eventFormValues({ ...stored, price_cents: 4000 }).price).toBe("40");
    expect(eventFormValues({ ...stored, price_cents: 0 }).price).toBe("0");
  });

  it("preço nulo (evento antigo) já vem como Preço não informado", () => {
    expect(eventFormValues({ ...stored, price_cents: null })).toMatchObject({
      price: "",
      priceUnknown: "1",
    });
    const fd = new FormData();
    for (const [k, v] of Object.entries(eventFormValues({ ...stored, price_cents: null })))
      fd.set(k, v);
    const r = parseEventForm(fd, { now: NOW, mode: "edit" });
    expect(r.ok && r.value).toMatchObject({ priceCents: null, priceUnknown: true });
  });
});
