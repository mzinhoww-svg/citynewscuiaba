import { readFixture } from "../../../../tests/fixtures/read";
import { detectFormat, extractFromFeed, extractFromJsonFeed, extractFromPage } from "./extract";

describe("extractFromFeed", () => {
  it("extrai 25 itens do feed da Folha do Cerrado com título, url e data", () => {
    const e = extractFromFeed(readFixture("folha-do-cerrado.xml"));
    expect(e).toHaveLength(25);
    expect(e[0]).toMatchObject({
      title: expect.any(String),
      url: expect.stringMatching(/^https:/),
      publishedAt: expect.any(String),
    });
  });

  it("RSS: data com fuso, autor, imagem e texto sem HTML", () => {
    const [first, second] = extractFromFeed(readFixture("folha-do-cerrado.xml"));
    expect(first).toMatchObject({
      title: "Cesta básica recua 2,1% em setembro na capital",
      url: "https://folhadocerrado.example/cidade/cesta-basica-recua-setembro",
      publishedAt: "2026-09-27T18:00:00.000Z",
      author: "Redação Folha do Cerrado",
      imageUrl: "https://folhadocerrado.example/img/001.jpg",
      excerpt:
        "O levantamento mensal aponta queda no preço do tomate e do feijão nos mercados de Cuiabá.",
      injection: false,
    });
    expect(second!.excerpt).toContain("Barão de Melgaço");
  });

  it("marca o item com instrução injetada e mantém os demais limpos", () => {
    const e = extractFromFeed(readFixture("folha-do-cerrado.xml"));
    const flagged = e.filter((x) => x.injection);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.url).toContain("nota-agenda-cultural");
    expect(flagged[0]!.injectionMatches.join(" ")).toMatch(/ignore as instrucoes/);
  });

  it("datas sem fuso do Diário da Baixada são de Cuiabá e links relativos são resolvidos", () => {
    const e = extractFromFeed(
      readFixture("diario-da-baixada.xml"),
      "https://diariodabaixada.example/rss",
    );
    expect(e.map((x) => x.publishedAt)).toEqual([
      "2026-09-27T18:00:00.000Z",
      "2026-09-27T13:30:00.000Z",
      "2026-09-27T12:15:00.000Z",
      "2026-09-27T11:00:00.000Z",
    ]);
    expect(e[0]!.url).toBe(
      "https://diariodabaixada.example/cidade/porto-faixa-pedestres-beira-rio",
    );
  });

  it("sitemap de notícias: título, data e imagem; URL sem título é ignorada", () => {
    const e = extractFromFeed(readFixture("mt-agora.xml"));
    expect(e).toHaveLength(3);
    expect(e[0]).toMatchObject({
      title: "Viaduto da Miguel Sutil: cronograma prevê entrega em 90 dias",
      url: "https://mtagora.example/cidade/viaduto-miguel-sutil-cronograma",
      publishedAt: "2026-09-27T17:10:00.000Z",
      imageUrl: "https://mtagora.example/img/viaduto.jpg",
    });
    expect(e[2]!.publishedAt).toBe("2026-09-26T04:00:00.000Z");
  });

  it("Atom: link alternate, published ou updated, título com HTML limpo", () => {
    const e = extractFromFeed(
      readFixture("portal-varzea.xml"),
      "https://portalvarzea.example/feed",
    );
    expect(e).toHaveLength(3);
    expect(e[0]).toMatchObject({
      title: "Várzea Grande amplia linha até o Cristo Rei",
      url: "https://portalvarzea.example/cidade/linha-cristo-rei",
      publishedAt: "2026-09-27T16:00:00.000Z",
      author: "Equipe Portal Várzea",
      imageUrl: "https://portalvarzea.example/img/cristo-rei.jpg",
    });
    expect(e[1]!.excerpt).toBe("Os boxes voltam a funcionar das 6h às 18h.");
    expect(e[2]!.url).toBe("https://portalvarzea.example/educacao/matriculas-rede-municipal");
  });

  it("XML com entidade declarada é recusado (sem expansão de entidades)", () => {
    const bomb =
      '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaaaaaa">]><rss><channel><item><title>&a;</title><link>https://x.example/a</link></item></channel></rss>';
    expect(extractFromFeed(bomb)).toEqual([]);
  });

  it("documento que não é feed devolve lista vazia", () => {
    expect(extractFromFeed("<html><body>oi</body></html>")).toEqual([]);
    expect(extractFromFeed("<rss><channel><item>")).toEqual([]);
  });
});

describe("outros formatos", () => {
  it("JSON Feed (api da Agência MT)", () => {
    const e = extractFromJsonFeed(readFixture("agencia-mt.json"));
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({
      title: "Governo divulga farmácias de plantão no fim de semana",
      publishedAt: "2026-09-27T14:00:00.000Z",
      author: "Agência MT",
      imageUrl: "https://agenciamt.example/img/farmacias.jpg",
    });
    expect(e[1]!.publishedAt).toBe("2026-09-27T13:00:00.000Z");
  });

  it("página (Readability): um item com URL canônica e data", () => {
    const e = extractFromPage(readFixture("radio-pantanal.html"), "https://radiopantanal.example/");
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({
      title: "Clássico na Arena Pantanal terá esquema especial de trânsito",
      url: "https://radiopantanal.example/esportes/classico-arena-transito",
      publishedAt: "2026-09-27T20:00:00.000Z",
    });
    expect(e[0]!.excerpt).toContain("Arena Pantanal");
  });

  it("detecta o formato", () => {
    expect(detectFormat(readFixture("folha-do-cerrado.xml"))).toBe("rss");
    expect(detectFormat(readFixture("portal-varzea.xml"))).toBe("atom");
    expect(detectFormat(readFixture("mt-agora.xml"))).toBe("sitemap");
    expect(detectFormat(readFixture("agencia-mt.json"))).toBe("jsonfeed");
    expect(detectFormat(readFixture("radio-pantanal.html"))).toBe("html");
    expect(detectFormat("")).toBeNull();
    expect(detectFormat("{}")).toBeNull();
  });
});
