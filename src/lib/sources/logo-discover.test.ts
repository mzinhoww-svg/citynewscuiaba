import {
  candidatesFromManifest,
  manifestUrlOf,
  pickLogoCandidates,
  profileImageOf,
  socialProfileUrls,
  wellKnownLogoUrls,
} from "./logo-discover";

const BASE = "https://folhadocerrado.example/";

const page = (head: string) =>
  `<!doctype html><html><head><title>Folha do Cerrado</title>${head}</head><body></body></html>`;

describe("pickLogoCandidates (R27)", () => {
  it("apple-touch-icon vence, e o maior tamanho declarado vem primeiro", () => {
    const html = page(`
      <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
      <link rel="apple-touch-icon" sizes="120x120" href="/at-120.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/at-180.png">
      <meta property="og:image" content="/capa.jpg">`);
    const out = pickLogoCandidates(html, BASE);
    expect(out[0]).toMatchObject({
      url: "https://folhadocerrado.example/at-180.png",
      kind: "apple-touch-icon",
    });
    expect(out[1]?.url).toBe("https://folhadocerrado.example/at-120.png");
  });

  it("resolve URL relativa, protocolo relativo e base com caminho", () => {
    const html = page(`
      <link rel="apple-touch-icon" href="img/at.png">
      <link rel="icon" type="image/png" sizes="96x96" href="//cdn.folhadocerrado.example/i.png">`);
    const out = pickLogoCandidates(html, "https://folhadocerrado.example/noticias/");
    expect(out.map((c) => c.url)).toEqual([
      "https://folhadocerrado.example/noticias/img/at.png",
      "https://cdn.folhadocerrado.example/i.png",
    ]);
  });

  it("ignora SVG, data: e ícone pequeno", () => {
    const html = page(`
      <link rel="apple-touch-icon" href="/logo.svg">
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <link rel="icon" type="image/png" sizes="32x32" href="/f32.png">
      <link rel="icon" type="image/png" sizes="16x16" href="data:image/png;base64,AAAA">
      <link rel="icon" type="image/png" sizes="128x128" href="/f128.png">`);
    const out = pickLogoCandidates(html, BASE);
    expect(out.map((c) => c.url)).toEqual(["https://folhadocerrado.example/f128.png"]);
  });

  it("og:image só entra se declarada quadrada", () => {
    const wide = page(`<meta property="og:image" content="/capa.png">
      <meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`);
    expect(pickLogoCandidates(wide, BASE)).toEqual([]);
    const undeclared = page(`<meta property="og:image" content="/capa.png">`);
    expect(pickLogoCandidates(undeclared, BASE)).toEqual([]);
    const square = page(`<meta property="og:image" content="/marca.png">
      <meta property="og:image:width" content="512"><meta property="og:image:height" content="512">`);
    expect(pickLogoCandidates(square, BASE)[0]).toMatchObject({ kind: "og-image" });
  });

  it("og:logo e logo do JSON-LD entram depois dos ícones", () => {
    const html = page(`
      <meta property="og:logo" content="/og-logo.png">
      <link rel="icon" type="image/png" sizes="256x256" href="/i.png">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"NewsMediaOrganization","logo":{"@type":"ImageObject","url":"/ld.png"}}]}</script>`);
    expect(pickLogoCandidates(html, BASE).map((c) => c.kind)).toEqual([
      "icon",
      "og-logo",
      "jsonld",
    ]);
  });

  it("manifest: ícones de 192 px ou mais, o maior primeiro, relativos ao manifest", () => {
    const html = page(`<link rel="manifest" href="/static/site.webmanifest">`);
    expect(manifestUrlOf(html, BASE)).toBe(
      "https://folhadocerrado.example/static/site.webmanifest",
    );
    const out = pickLogoCandidates(html, BASE, {
      manifest: {
        url: "https://folhadocerrado.example/static/site.webmanifest",
        json: {
          icons: [
            { src: "i-96.png", sizes: "96x96", type: "image/png" },
            { src: "i-192.png", sizes: "192x192", type: "image/png" },
            { src: "/i-512.png", sizes: "512x512", type: "image/png" },
            { src: "i.svg", sizes: "any", type: "image/svg+xml" },
          ],
        },
      },
    });
    expect(out.map((c) => c.url)).toEqual([
      "https://folhadocerrado.example/i-512.png",
      "https://folhadocerrado.example/static/i-192.png",
    ]);
    expect(candidatesFromManifest({ icons: "x" }, "https://a.example/m.json")).toEqual([]);
  });

  it("no máximo 5 candidatos, sem repetir URL", () => {
    const links = Array.from(
      { length: 9 },
      (_, i) => `<link rel="apple-touch-icon" sizes="${100 + i}x${100 + i}" href="/a${i % 7}.png">`,
    ).join("");
    const out = pickLogoCandidates(page(links), BASE);
    expect(out).toHaveLength(5);
    expect(new Set(out.map((c) => c.url)).size).toBe(5);
  });

  it("só olha o <head> e ignora comentários", () => {
    const html = `<html><head><!-- <link rel="apple-touch-icon" href="/morto.png"> --></head>
      <body><link rel="apple-touch-icon" href="/corpo.png"></body></html>`;
    expect(pickLogoCandidates(html, BASE)).toEqual([]);
  });

  it("aceita atributos sem aspas, aspas simples e entidades", () => {
    const html = page(`<link rel=apple-touch-icon href='/a.png?x=1&amp;y=2'>`);
    expect(pickLogoCandidates(html, BASE)[0]?.url).toBe(
      "https://folhadocerrado.example/a.png?x=1&y=2",
    );
  });

  it("recusa esquema que não seja http(s)", () => {
    const html = page(`<link rel="apple-touch-icon" href="javascript:alert(1)">
      <link rel="apple-touch-icon" href="ftp://x.example/a.png">`);
    expect(pickLogoCandidates(html, BASE)).toEqual([]);
  });
});

describe("profileImageOf", () => {
  it("lê og:image da página de perfil, relativa resolvida, SVG ignorado", () => {
    expect(
      profileImageOf(
        `<head><meta property="og:image" content="/p/foto.jpg"></head>`,
        "https://www.facebook.com/folha",
      ),
    ).toBe("https://www.facebook.com/p/foto.jpg");
    expect(
      profileImageOf(
        `<head><meta name="twitter:image" content="a.png"></head>`,
        "https://x.com/f/",
      ),
    ).toBe("https://x.com/f/a.png");
    expect(
      profileImageOf(`<head><meta property="og:image" content="/a.svg"></head>`, "https://x.com/"),
    ).toBeNull();
  });
});

describe("reservas", () => {
  it("caminhos conhecidos no domínio da fonte", () => {
    const urls = wellKnownLogoUrls("https://mtagora.example/cidades?x=1");
    expect(urls[0]).toBe("https://mtagora.example/apple-touch-icon.png");
    expect(urls.every((u) => u.startsWith("https://mtagora.example/"))).toBe(true);
  });

  it("perfis oficiais ligados pela página (sameAs e links), sem compartilhar nem post", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"sameAs":["https://www.facebook.com/folhadocerrado","https://x.com/folhacerrado"]}</script></head>
      <body><a href="https://www.instagram.com/folhadocerrado/">IG</a>
      <a href="https://www.facebook.com/sharer/sharer.php?u=x">compartilhar</a>
      <a href="https://www.instagram.com/p/AbC123/">post</a>
      <a href="https://outro.example/">outro</a></body></html>`;
    expect(socialProfileUrls(html, "https://folhadocerrado.example/")).toEqual([
      "https://www.facebook.com/folhadocerrado",
      "https://x.com/folhacerrado",
      "https://www.instagram.com/folhadocerrado/",
    ]);
  });
});
