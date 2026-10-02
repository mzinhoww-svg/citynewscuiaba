import { crawlerToken, discoverFeed, isAllowedByRobots } from "./crawl";

const UA = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";

describe("discoverFeed", () => {
  it("descobre RSS por autodiscovery", () =>
    expect(
      discoverFeed(
        "https://www.rdnews.com.br",
        '<link rel="alternate" type="application/rss+xml" href="/feed">',
      ),
    ).toEqual({ kind: "rss", url: "https://www.rdnews.com.br/feed" }));
  it("Atom também conta como rss", () =>
    expect(
      discoverFeed(
        "https://portalvarzea.example/",
        '<html><head><link type="application/atom+xml" rel="alternate" href="https://portalvarzea.example/atom.xml"></head></html>',
      ),
    ).toEqual({ kind: "rss", url: "https://portalvarzea.example/atom.xml" }));
  it("link para /rss ou sitemap de notícias na página", () => {
    expect(discoverFeed("https://a.example", '<a href="/rss">RSS</a>')).toEqual({
      kind: "rss",
      url: "https://a.example/rss",
    });
    expect(discoverFeed("https://a.example", '<a href="/sitemap-news.xml">mapa</a>')).toEqual({
      kind: "sitemap",
      url: "https://a.example/sitemap-news.xml",
    });
  });
  it("sem nada: null", () =>
    expect(discoverFeed("https://a.example", "<html><body>oi</body></html>")).toBeNull());
  it("ignora links de outro esquema", () =>
    expect(
      discoverFeed(
        "https://a.example",
        '<link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">',
      ),
    ).toBeNull());
});

describe("robots.txt", () => {
  it("respeita Disallow do robots", () =>
    expect(
      isAllowedByRobots("User-agent: *\nDisallow: /busca", "CityNewsBot/1.0", "/busca?q=x"),
    ).toBe(false));
  it("sem regra que case, permite", () =>
    expect(isAllowedByRobots("User-agent: *\nDisallow: /busca", UA, "/feed")).toBe(true));
  it("grupo específico do robô vence o *", () => {
    const txt =
      "User-agent: *\nDisallow: /\n\nUser-agent: citynewsbot\nAllow: /feed\nDisallow: /admin";
    expect(isAllowedByRobots(txt, UA, "/feed")).toBe(true);
    expect(isAllowedByRobots(txt, UA, "/qualquer")).toBe(true);
    expect(isAllowedByRobots(txt, UA, "/admin/x")).toBe(false);
  });
  it("regra mais longa vence; empate favorece Allow", () => {
    const txt =
      "User-agent: *\nDisallow: /noticias\nAllow: /noticias/feed\nDisallow: /a\nAllow: /a";
    expect(isAllowedByRobots(txt, UA, "/noticias/feed")).toBe(true);
    expect(isAllowedByRobots(txt, UA, "/noticias/x")).toBe(false);
    expect(isAllowedByRobots(txt, UA, "/a")).toBe(true);
  });
  it("curinga e âncora de fim", () => {
    const txt = "User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?print=";
    expect(isAllowedByRobots(txt, UA, "/doc.pdf")).toBe(false);
    expect(isAllowedByRobots(txt, UA, "/doc.pdf?x=1")).toBe(true);
    expect(isAllowedByRobots(txt, UA, "/n?print=1")).toBe(false);
  });
  it("Disallow vazio permite tudo; comentários e grupos com vários agentes", () => {
    expect(isAllowedByRobots("User-agent: *\nDisallow:", UA, "/x")).toBe(true);
    const txt =
      "# comentário\nUser-agent: OutroBot\nUser-agent: CityNewsBot # nós\nDisallow: /privado";
    expect(isAllowedByRobots(txt, UA, "/privado/1")).toBe(false);
  });
  it("robots.txt é sempre permitido", () =>
    expect(isAllowedByRobots("User-agent: *\nDisallow: /", UA, "/robots.txt")).toBe(true));
  it("token do user-agent", () => expect(crawlerToken(UA)).toBe("citynewsbot"));
});
