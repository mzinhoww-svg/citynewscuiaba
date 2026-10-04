import sharp from "sharp";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import { discoverSourceLogo } from "./logo-fetch";

const UA = "CityNewsBot/1.0 (+https://citynewscuiaba.example/sobre#robo)";
const SITE = "https://folhadocerrado.example";

async function png(w: number, h: number): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width: w, height: h, channels: 3, background: { r: 10, g: 90, b: 160 } },
    })
      .png()
      .toBuffer(),
  );
}

const html = (head: string): FakeRoute => ({
  headers: { "content-type": "text/html; charset=utf-8" },
  body: `<!doctype html><html><head>${head}</head><body></body></html>`,
});
const img = (body: Uint8Array, type = "image/png"): FakeRoute => ({
  headers: { "content-type": type },
  body,
});

function run(routes: Record<string, FakeRoute>, base = `${SITE}/`) {
  const fake = createFakeHttp(routes);
  const result = discoverSourceLogo(
    { http: fake.http, resolve: fakeResolve(), userAgent: UA },
    base,
  );
  return { fake, result };
}

describe("discoverSourceLogo (R27)", () => {
  it("apple-touch-icon vence: baixa, valida e devolve a origem", async () => {
    const good = await png(180, 180);
    const { fake, result } = run({
      [`${SITE}/robots.txt`]: { body: "User-agent: *\nAllow: /\n" },
      [`${SITE}/`]: html(`
        <link rel="icon" type="image/png" sizes="96x96" href="/f96.png">
        <link rel="apple-touch-icon" sizes="180x180" href="/img/at.png">`),
      [`${SITE}/img/at.png`]: img(good),
      [`${SITE}/f96.png`]: img(await png(96, 96)),
    });
    const r = await result;
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.originUrl).toBe(`${SITE}/img/at.png`);
      expect(r.value.kind).toBe("apple-touch-icon");
      expect(r.value.contentType).toBe("image/png");
    }
    // Parou no primeiro que passou.
    expect(fake.calls.some((c) => c.url.endsWith("/f96.png"))).toBe(false);
    expect(fake.calls[0]?.headers.get("user-agent")).toBe(UA);
  });

  it("não quadrado é recusado e o próximo candidato é tentado", async () => {
    const { result } = run({
      [`${SITE}/robots.txt`]: { status: 404 },
      [`${SITE}/`]: html(`
        <link rel="apple-touch-icon" href="/wide.png">
        <link rel="icon" type="image/png" sizes="128x128" href="/ok.png">`),
      [`${SITE}/wide.png`]: img(await png(400, 120)),
      [`${SITE}/ok.png`]: img(await png(128, 128)),
    });
    const r = await result;
    expect(r.ok && r.value.originUrl).toBe(`${SITE}/ok.png`);
  });

  it("SVG nunca é baixado nem aceito, mesmo com tipo image/png", async () => {
    const svg = Uint8Array.from(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"/>'),
    );
    const { fake, result } = run({
      [`${SITE}/robots.txt`]: { status: 404 },
      [`${SITE}/`]: html(
        `<link rel="apple-touch-icon" href="/a.svg"><link rel="icon" type="image/png" sizes="192x192" href="/fake.png">`,
      ),
      [`${SITE}/fake.png`]: img(svg, "image/png"),
    });
    const r = await result;
    expect(r.ok).toBe(false);
    expect(fake.calls.some((c) => c.url.endsWith("/a.svg"))).toBe(false);
  });

  it("manifest e caminho conhecido entram como reserva", async () => {
    const { result } = run({
      [`${SITE}/robots.txt`]: { status: 404 },
      [`${SITE}/`]: html(`<link rel="manifest" href="/site.webmanifest">`),
      [`${SITE}/site.webmanifest`]: {
        headers: { "content-type": "application/manifest+json" },
        body: JSON.stringify({
          icons: [{ src: "/m512.png", sizes: "512x512", type: "image/png" }],
        }),
      },
      [`${SITE}/m512.png`]: img(await png(512, 512)),
    });
    const r = await result;
    expect(r.ok && r.value.kind).toBe("manifest");

    const wk = run({
      [`${SITE}/robots.txt`]: { status: 404 },
      [`${SITE}/`]: html(``),
      [`${SITE}/apple-touch-icon.png`]: img(await png(180, 180)),
    });
    const r2 = await wk.result;
    expect(r2.ok && r2.value.kind).toBe("well-known");
  });

  it("robots.txt que proíbe a página: nada é baixado", async () => {
    const { fake, result } = run({
      [`${SITE}/robots.txt`]: { body: "User-agent: *\nDisallow: /\n" },
      [`${SITE}/`]: html(`<link rel="apple-touch-icon" href="/a.png">`),
    });
    const r = await result;
    expect(r).toMatchObject({ ok: false, error: { reason: "robots" } });
    expect(fake.calls.map((c) => c.url)).toEqual([`${SITE}/robots.txt`]);
  });

  it("host interno (SSRF) é recusado e não vira chamada", async () => {
    const fake = createFakeHttp({});
    const r = await discoverSourceLogo(
      { http: fake.http, resolve: fakeResolve({ "interno.example": ["10.0.0.5"] }), userAgent: UA },
      "https://interno.example/",
    );
    expect(r.ok).toBe(false);
    expect(
      fake.calls.filter((c) => c.url.includes("interno.example/") && !c.url.endsWith("robots.txt")),
    ).toEqual([]);
  });

  it("candidato que aponta para IP privado é pulado", async () => {
    const fake = createFakeHttp({
      [`${SITE}/robots.txt`]: { status: 404 },
      [`${SITE}/`]: html(
        `<link rel="apple-touch-icon" href="http://localhost/a.png"><link rel="icon" type="image/png" sizes="128x128" href="/ok.png">`,
      ),
      [`${SITE}/ok.png`]: img(await png(128, 128)),
    });
    const r = await discoverSourceLogo(
      { http: fake.http, resolve: fakeResolve(), userAgent: UA },
      `${SITE}/`,
    );
    expect(r.ok && r.value.originUrl).toBe(`${SITE}/ok.png`);
    expect(fake.calls.some((c) => c.url.includes("localhost"))).toBe(false);
  });

  it("imagem de mais de 2 MB é recusada", async () => {
    const huge = new Uint8Array(2 * 1024 * 1024 + 10);
    const { result } = run({
      [`${SITE}/robots.txt`]: { status: 404 },
      [`${SITE}/`]: html(`<link rel="apple-touch-icon" href="/big.png">`),
      [`${SITE}/big.png`]: img(huge),
    });
    const r = await result;
    expect(r.ok).toBe(false);
  });

  it("perfil oficial é o último recurso (e respeita o robots dele)", async () => {
    const fb = "https://www.facebook.com/folhadocerrado";
    const ig = "https://www.instagram.com/folhadocerrado/";
    const { fake, result } = run({
      [`${SITE}/robots.txt`]: { status: 404 },
      [`${SITE}/`]: html(
        `<script type="application/ld+json">{"sameAs":["${fb}","${ig}"]}</script>`,
      ),
      "https://www.facebook.com/robots.txt": { body: "User-agent: *\nDisallow: /\n" },
      "https://www.instagram.com/robots.txt": { status: 404 },
      [ig]: html(`<meta property="og:image" content="https://cdn.instagram.example/perfil.png">`),
      "https://cdn.instagram.example/perfil.png": img(await png(320, 320)),
    });
    const r = await result;
    expect(r.ok && r.value.kind).toBe("social");
    if (r.ok) expect(r.value.originUrl).toBe("https://cdn.instagram.example/perfil.png");
    expect(fake.calls.some((c) => c.url === fb)).toBe(false);
  });

  it("sem nenhuma imagem válida: no_logo com as tentativas", async () => {
    const { result } = run({
      [`${SITE}/robots.txt`]: { status: 404 },
      [`${SITE}/`]: html(`<link rel="apple-touch-icon" href="/a.png">`),
      [`${SITE}/a.png`]: img(await png(40, 40)),
    });
    const r = await result;
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.reason).toBe("no_logo");
      expect(r.error.attempts[0]).toMatchObject({ url: `${SITE}/a.png` });
    }
  });

  it("página fora do ar: page_unreachable", async () => {
    const { result } = run({
      [`${SITE}/robots.txt`]: { status: 404 },
      [`${SITE}/`]: { status: 503 },
    });
    expect(await result).toMatchObject({ ok: false, error: { reason: "page_unreachable" } });
  });
});
