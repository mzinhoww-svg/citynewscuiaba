import {
  mergeSitemaps,
  previousYearSitemapUrl,
  repairTruncatedSitemap,
  resolveYearlySitemapUrl,
  titleFromSlug,
} from "./sitemap";

const HEAD =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
const url = (n: number) =>
  `  <url>\n    <loc>https://exemplo.example/noticias/materia-${n}</loc>\n    <lastmod>2026-10-02T10:0${n}:00.000Z</lastmod>\n  </url>\n`;

describe("repairTruncatedSitemap", () => {
  it("documento completo passa intacto", () => {
    const xml = `${HEAD}${url(1)}</urlset>`;
    expect(repairTruncatedSitemap(xml)).toBe(xml);
  });

  it("corta no último </url> e fecha o urlset", () => {
    const xml = `${HEAD}${url(1)}${url(2)}  <url>\n    <loc>https://exemplo.example/noticias/mat`;
    expect(repairTruncatedSitemap(xml)).toBe(`${HEAD}${url(1)}${url(2).trimEnd()}</urlset>`);
  });

  it.each([
    ["no meio de uma tag de abertura", "  <url>\n    <lo"],
    ["no meio de uma tag de fechamento", "  <url>\n    <loc>https://x.example/a</loc>\n  </ur"],
    [
      "no meio do lastmod",
      "  <url>\n    <loc>https://x.example/a</loc>\n    <lastmod>2026-10-02T1",
    ],
    ["logo depois de um <url>", "  <url>"],
  ])("corte %s", (_nome, tail) => {
    const out = repairTruncatedSitemap(`${HEAD}${url(1)}${tail}`);
    expect(out).toBe(`${HEAD}${url(1).trimEnd()}</urlset>`);
  });

  it("corte dentro do cabeçalho (sem nenhuma <url>) devolve vazio", () => {
    expect(repairTruncatedSitemap('<?xml version="1.0"?>\n<urlset xmlns="http://www.sitem')).toBe(
      "",
    );
  });

  it("cabeçalho completo e nenhuma <url> fecha o urlset vazio", () => {
    expect(repairTruncatedSitemap(HEAD)).toBe(`${HEAD.trimEnd()}</urlset>`);
  });

  it("não mexe em outros formatos", () => {
    expect(repairTruncatedSitemap("<rss><channel><item>")).toBe("<rss><channel><item>");
  });
});

describe("titleFromSlug", () => {
  it("usa o último trecho do caminho, hífens viram espaço e a primeira letra sobe", () => {
    expect(
      titleFromSlug("https://exemplo.example/noticias/prefeitura-anuncia-obra-no-centro"),
    ).toBe("Prefeitura anuncia obra no centro");
  });

  it("decodifica %XX (acentos)", () => {
    expect(
      titleFromSlug("https://exemplo.example/n/educa%C3%A7%C3%A3o-avan%C3%A7a-em-cuiab%C3%A1"),
    ).toBe("Educação avança em cuiabá");
    expect(titleFromSlug("https://exemplo.example/n/%C3%A1gua-volta")).toBe("Água volta");
  });

  it("remove extensão e sufixo numérico de id; mantém ano no fim do título", () => {
    expect(titleFromSlug("https://exemplo.example/n/obra-no-centro-123456.html")).toBe(
      "Obra no centro",
    );
    expect(titleFromSlug("https://exemplo.example/n/obra-no-centro_98765")).toBe("Obra no centro");
    expect(titleFromSlug("https://exemplo.example/n/123456-obra-no-centro")).toBe("Obra no centro");
    expect(titleFromSlug("https://exemplo.example/n/orcamento-de-2027")).toBe("Orcamento de 2027");
  });

  it("ignora barra final, query e hash", () => {
    expect(titleFromSlug("https://exemplo.example/n/chuva-forte/?utm=1#x")).toBe("Chuva forte");
  });

  it("percent-encoding inválido não quebra", () => {
    expect(titleFromSlug("https://exemplo.example/n/oferta-100%-garantida")).toBe(
      "Oferta 100% garantida",
    );
  });

  it("limita ao teto de título", () => {
    const slug = Array.from({ length: 200 }, () => "palavra").join("-");
    expect(titleFromSlug(`https://exemplo.example/n/${slug}`, 50)!.length).toBeLessThanOrEqual(50);
  });

  it("sem slug aproveitável devolve null", () => {
    expect(titleFromSlug("https://exemplo.example/")).toBeNull();
    expect(titleFromSlug("https://exemplo.example/n/12345")).toBeNull();
    expect(titleFromSlug("não é url")).toBeNull();
  });
});

describe("resolveYearlySitemapUrl", () => {
  const u = "https://exemplo.example/sitemap/geral/2025.xml";
  const at = (iso: string) => new Date(iso);

  it("troca o ano pelo corrente em America/Cuiaba", () => {
    expect(resolveYearlySitemapUrl(u, at("2026-10-02T12:00:00Z"))).toBe(
      "https://exemplo.example/sitemap/geral/2026.xml",
    );
  });

  it("mantém quando o ano já é o corrente", () => {
    const cur = "https://exemplo.example/sitemap/geral/2026.xml";
    expect(resolveYearlySitemapUrl(cur, at("2026-10-02T12:00:00Z"))).toBe(cur);
  });

  it("virada do ano segue Cuiabá (UTC-4), não UTC", () => {
    const y26 = "https://exemplo.example/sitemap/geral/2026.xml";
    // 31/12 23:30 em Cuiabá = 01/01 03:30 UTC: ainda é 2026
    expect(resolveYearlySitemapUrl(y26, at("2027-01-01T03:30:00Z"))).toBe(y26);
    // 01/01 00:00 em Cuiabá = 01/01 04:00 UTC: já é 2027
    expect(resolveYearlySitemapUrl(y26, at("2027-01-01T04:00:00Z"))).toBe(
      "https://exemplo.example/sitemap/geral/2027.xml",
    );
  });

  it("não mexe em URL que não termina em /AAAA.xml", () => {
    for (const other of [
      "https://exemplo.example/sitemap-news.xml",
      "https://exemplo.example/sitemap/geral/2026.xml.gz",
      "https://exemplo.example/sitemap/geral/26.xml",
      "https://exemplo.example/sitemap/2026/geral.xml",
    ])
      expect(resolveYearlySitemapUrl(other, at("2027-03-01T12:00:00Z"))).toBe(other);
  });

  it("preserva query string", () => {
    expect(
      resolveYearlySitemapUrl("https://e.example/s/2025.xml?x=1", at("2026-10-02T12:00:00Z")),
    ).toBe("https://e.example/s/2026.xml?x=1");
  });
});

describe("previousYearSitemapUrl", () => {
  const u = "https://exemplo.example/sitemap/geral/2027.xml";
  it("só em 1º e 2 de janeiro (Cuiabá) devolve o arquivo do ano anterior", () => {
    expect(previousYearSitemapUrl(u, new Date("2027-01-01T04:00:00Z"))).toBe(
      "https://exemplo.example/sitemap/geral/2026.xml",
    );
    expect(previousYearSitemapUrl(u, new Date("2027-01-03T03:59:00Z"))).toBe(
      "https://exemplo.example/sitemap/geral/2026.xml",
    );
    expect(previousYearSitemapUrl(u, new Date("2027-01-03T04:00:00Z"))).toBeNull();
    expect(previousYearSitemapUrl(u, new Date("2026-12-31T12:00:00Z"))).toBeNull();
  });
  it("URL sem ano no nome: null", () => {
    expect(
      previousYearSitemapUrl(
        "https://e.example/sitemap-news.xml",
        new Date("2027-01-01T12:00:00Z"),
      ),
    ).toBeNull();
  });
});

const squash = (s: string) => s.replace(/\s+/g, "");

describe("mergeSitemaps", () => {
  it("junta as <url> do segundo (reparado) ao primeiro", () => {
    const a = `${HEAD}${url(1)}</urlset>`;
    const b = `${HEAD}${url(2)}${url(3)}  <url>\n    <loc>https://exemplo.example/cort`;
    expect(squash(mergeSitemaps(a, b))).toBe(squash(`${HEAD}${url(1)}${url(2)}${url(3)}</urlset>`));
  });
  it("primeiro vazio devolve o segundo reparado", () => {
    expect(squash(mergeSitemaps("", `${HEAD}${url(2)}`))).toBe(squash(`${HEAD}${url(2)}</urlset>`));
  });
});
