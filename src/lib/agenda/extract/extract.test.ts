import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractIcal } from "./ical";
import { extractJsonLd } from "./jsonld";
import { extractRss } from "./rss";
import { extractSympla } from "./sympla";
import { extractTribe } from "./tribe";

const read = (rel: string) => readFileSync(join(process.cwd(), "tests/fixtures", rel), "utf8");
const NOW = new Date("2026-10-03T15:00:00Z");

describe("extractJsonLd", () => {
  const events = extractJsonLd(read("sites/cerrado-vivo-home.html"));
  it("lê ItemList e @graph, incluindo subtipos de Event", () => {
    expect(events.map((e) => e.title)).toEqual([
      "Noite do Siriri Moderno",
      "Sarau Aberto da Casa",
      "Festival de Inverno Encerrado",
      "Live online de lançamento",
      "Peça Cuiabana: O Rasqueado",
      "Festa da Putaria Total",
      "Sem data definida",
    ]);
  });
  it("extrai data, local, bairro, link e preço", () => {
    expect(events[0]).toMatchObject({
      start: "2026-10-17T20:00:00-04:00",
      end: "2026-10-17T23:30:00-04:00",
      venue: "Casa Cerrado Vivo",
      city: "Cuiabá",
      neighborhood: "Porto",
      url: "https://cerradovivo.example/shows/siriri-moderno",
      priceCents: 4000,
    });
  });
  it("gratuito explícito vale 0; oferta 0 vale 0; sem oferta fica indefinido", () => {
    expect(events[1]?.priceCents).toBe(0);
    expect(events[4]?.priceCents).toBe(0);
    expect(events[3]?.priceCents).toBeUndefined();
  });
  it("marca evento online e devolve item sem data com start vazio", () => {
    expect(events[3]?.online).toBe(true);
    expect(events[6]?.start).toBe("");
  });
  it("ignora JSON inválido e HTML sem blocos", () => {
    expect(extractJsonLd('<script type="application/ld+json">{oops</script>')).toEqual([]);
    expect(extractJsonLd("<p>nada</p>")).toEqual([]);
  });
});

describe("extractIcal", () => {
  const events = extractIcal(read("agenda/cultura-varzea.ics"));
  it("lê VEVENT com TZID, UTC e dia inteiro", () => {
    expect(events.map((e) => [e.title, e.start])).toEqual([
      ["Cine Praça: sessão ao ar livre", "2026-10-10T19:00"],
      ["Baile da Saudade", "2026-10-31T23:00:00Z"],
      ["Dia de feira cultural", "2026-11-15"],
    ]);
  });
  it("separa local e cidade, com vírgula escapada", () => {
    expect(events[0]).toMatchObject({
      venue: "Praça Central",
      city: "Várzea Grande",
      url: "https://culturavarzea.example/eventos/cine-praca",
      category: "Cinema",
    });
  });
  it("ignora fuso estrangeiro", () => {
    const ics = "BEGIN:VEVENT\nDTSTART;TZID=Europe/Paris:20261010T190000\nSUMMARY:X\nEND:VEVENT";
    expect(extractIcal(ics)).toEqual([]);
  });
});

describe("extractRss", () => {
  const events = extractRss(read("agenda/agenda-mt-feed.xml"), NOW);
  it("só vale item com data de evento no texto", () => {
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      start: "2026-10-21T18:00",
      venue: "Museu do Rio",
      city: "Cuiabá",
      priceCents: 0,
      url: "https://agendamt.example/expo-rios",
    });
    expect(events[0]?.title).toBe('Exposição "Rios de Cuiabá" abre no Museu do Rio');
    expect(events[1]).toMatchObject({ start: "2026-11-08T09:00", priceCents: 0 });
  });
});

describe("extractSympla", () => {
  const events = extractSympla(read("agenda/ingressos-cuiaba.html"));
  it("lê a lista embutida na página", () => {
    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      title: "Festival Cerrado Eletrônico",
      start: "2026-11-21T22:00:00+00:00",
      city: "Cuiabá",
      neighborhood: "Verdão",
      venue: "Arena Pantanal Fictícia",
    });
    expect(events[3]?.online).toBe(true);
  });
  it("devolve vazio para página sem a lista", () => {
    expect(extractSympla("<html></html>")).toEqual([]);
  });
});

describe("extractTribe", () => {
  const { events, next } = extractTribe(read("sites/eventos-cerrado-tribe.json"));
  it("tira o sufixo de hora do título e converte a data", () => {
    expect(events[0]).toMatchObject({
      title: "Sarau da Casa Exemplo",
      start: "2026-10-09T19:00",
      end: "2026-10-09T21:30",
      venue: "Casa Exemplo",
      address: "Rua das Flores, 100",
      city: "Cuiabá",
      url: "https://eventos-cerrado.example/evento/sarau-da-casa/",
      category: "Música",
    });
    expect(events[2]?.title).toBe("Oficina de Cerâmica");
  });
  it("dia inteiro vira só data e local ausente (array vazio) não quebra", () => {
    expect(events[1]).toMatchObject({ title: "Feira Livre do Cerrado", start: "2026-10-11" });
    expect(events[1]?.end ?? null).toBeNull();
    expect(events[1]?.venue ?? null).toBeNull();
  });
  it("preço: vazio ausente, Gratuito 0, R$ em centavos", () => {
    expect(events[0]?.priceCents ?? null).toBeNull();
    expect(events[1]?.priceCents).toBe(0);
    expect(events[2]?.priceCents).toBe(5000);
  });
  it("devolve next_rest_url", () => {
    expect(next).toBe(
      "https://eventos-cerrado.example/wp-json/tribe/events/v1/events/?page=2&per_page=50",
    );
  });
  it("JSON inválido ou sem eventos devolve vazio", () => {
    expect(extractTribe("{nao e json")).toEqual({ events: [], next: null });
    expect(extractTribe("[]")).toEqual({ events: [], next: null });
    expect(extractTribe('{"events":[]}')).toEqual({ events: [], next: null });
  });
  it("só tira sufixo de hora no fim; o resto do título fica", () => {
    const body = JSON.stringify({
      events: [
        { title: "Show 2h de Rock, 20h", start_date: "2026-10-09 20:00:00" },
        { title: "Noite 19h30 Especial", start_date: "2026-10-09 19:30:00" },
        { title: "Baile, 21h30", start_date: "2026-10-09 21:30:00" },
      ],
    });
    expect(extractTribe(body).events.map((e) => e.title)).toEqual([
      "Show 2h de Rock",
      "Noite 19h30 Especial",
      "Baile",
    ]);
  });
  it("preço acima de mil reais e textos com mais de um valor", () => {
    const cost = (c: string) =>
      extractTribe(
        JSON.stringify({ events: [{ title: "X", start_date: "2026-10-09 20:00:00", cost: c }] }),
      ).events[0]?.priceCents;
    expect(cost("R$ 1234")).toBe(123400);
    expect(cost("R$ 1234,50")).toBe(123450);
    expect(cost("R$ 1.234,50")).toBe(123450);
    expect(cost("A partir de R$ 30,00")).toBe(3000);
    expect(cost("R$ 50 – R$ 120")).toBe(5000);
  });
  it("título que é só o sufixo de hora fica como veio", () => {
    const body = JSON.stringify({
      events: [{ title: ", 19h", start_date: "2026-10-09 19:00:00" }],
    });
    expect(extractTribe(body).events[0]?.title).toBe(", 19h");
  });
});
