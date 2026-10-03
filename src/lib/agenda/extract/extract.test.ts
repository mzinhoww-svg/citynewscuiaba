import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractIcal } from "./ical";
import { extractJsonLd } from "./jsonld";
import { extractRss } from "./rss";
import { extractSympla } from "./sympla";

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
