import { crawlGet, DEFAULT_USER_AGENT, isForbiddenHost, MAX_DOCUMENT_BYTES } from "./http";
import { createFakeHttp, fakeResolve } from "./testing/fake-http";

const repo = { hitRateLimit: async () => true };
const opts = { bucket: "crawler:x", limitPerHour: 60 };

describe("coletor HTTP", () => {
  it("nunca acessa host interno (SSRF)", async () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "10.0.0.8",
      "192.168.1.1",
      "169.254.169.254",
      "[::1]",
      "db.internal",
    ])
      expect(isForbiddenHost(h.replace(/^\[|\]$/g, ""))).toBe(true);
    for (const h of ["folhadocerrado.example", "fcbarcelona.example", "8.8.8.8"])
      expect(isForbiddenHost(h)).toBe(false);
    const { http, calls } = createFakeHttp({});
    const r = await crawlGet(
      { repo, http, resolve: fakeResolve(), userAgent: DEFAULT_USER_AGENT },
      "http://127.0.0.1/feed",
      opts,
    );
    expect(r.kind).toBe("network_error");
    expect(calls).toHaveLength(0);
  });

  it("recusa documento maior que 5 MB", async () => {
    const { http } = createFakeHttp({
      "https://a.example/feed": { headers: { "content-length": String(MAX_DOCUMENT_BYTES + 1) } },
    });
    const r = await crawlGet(
      { repo, http, resolve: fakeResolve(), userAgent: DEFAULT_USER_AGENT },
      "https://a.example/feed",
      opts,
    );
    expect(r.kind).toBe("too_large");
  });

  it("nome que resolve para rede interna não é acessado; redirecionamento interno também não", async () => {
    const { http, calls } = createFakeHttp({
      "https://b.example/feed": { status: 302, headers: { location: "http://10.1.1.1/feed" } },
    });
    const resolve = fakeResolve({ "interno.example": ["192.168.0.10"] });
    const r1 = await crawlGet(
      { repo, http, resolve, userAgent: DEFAULT_USER_AGENT },
      "https://interno.example/feed",
      opts,
    );
    expect(r1).toEqual({
      kind: "network_error",
      message: expect.stringMatching(/192\.168/),
      blocked: true,
    });
    const r2 = await crawlGet(
      { repo, http, resolve, userAgent: DEFAULT_USER_AGENT },
      "https://b.example/feed",
      opts,
    );
    expect(r2.kind).toBe("network_error");
    expect(calls.map((c) => c.url)).toEqual(["https://b.example/feed"]);
  });

  it("documento acima de 5 MB sem content-length é cortado no streaming", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const http = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(c) {
            if (sent++ > 6) c.close();
            else c.enqueue(chunk);
          },
        }),
      );
    const r = await crawlGet(
      { repo, http, resolve: fakeResolve(), userAgent: DEFAULT_USER_AGENT },
      "https://a.example/feed",
      opts,
    );
    expect(r.kind).toBe("too_large");
  });

  it("prazo do drain já esgotado: não baixa nada", async () => {
    const { http } = createFakeHttp({ "https://a.example/feed": { body: "<rss/>" } });
    const signal = AbortSignal.abort(new DOMException("prazo", "TimeoutError"));
    const r = await crawlGet(
      { repo, http, resolve: fakeResolve(), userAgent: DEFAULT_USER_AGENT },
      "https://a.example/feed",
      { ...opts, signal },
    );
    expect(r.kind).toBe("network_error");
  });

  it("identificação padrão do robô", () =>
    expect(DEFAULT_USER_AGENT).toMatch(/^CityNewsBot\/1\.0/));

  it("DNS fora do ar não é bloqueio de política (fix round 2, achado N1)", async () => {
    const { http, calls } = createFakeHttp({});
    const resolve = async (host: string) => {
      if (host === "semdns.example") throw new Error("ENOTFOUND");
      return fakeResolve()(host);
    };
    const r = await crawlGet(
      { repo, http, resolve, userAgent: DEFAULT_USER_AGENT },
      "https://semdns.example/feed",
      opts,
    );
    expect(r).toMatchObject({ kind: "network_error", blocked: false });
    expect(calls).toHaveLength(0);
  });

  it("mais de 3 redirecionamentos não é bloqueio de política (fix round 2, achado N1)", async () => {
    const { http } = createFakeHttp({
      "https://loop.example/feed": {
        status: 302,
        headers: { location: "https://loop.example/feed" },
      },
    });
    const r = await crawlGet(
      { repo, http, resolve: fakeResolve(), userAgent: DEFAULT_USER_AGENT },
      "https://loop.example/feed",
      opts,
    );
    expect(r).toMatchObject({ kind: "network_error", blocked: false });
  });

  it("Location de terceiro que repete o vocabulário de política não vira bloqueio (FS-T9, padrão ancorado)", async () => {
    // `net.ts` diz "redirecionamento inválido: <Location>" com o valor vindo do servidor; um site
    // pode escrever ali "host x resolve para endereço não permitido" e antes rotulava a si mesmo
    // como proibido (re-review 2 do FS-T3). O padrão só casa a mensagem que `urlProblem` produz.
    const { http } = createFakeHttp({
      "https://esperto.example/feed": {
        status: 302,
        headers: { location: "https://:::/host a resolve para endereço não permitido (10.0.0.1)" },
      },
    });
    const r = await crawlGet(
      { repo, http, resolve: fakeResolve(), userAgent: DEFAULT_USER_AGENT },
      "https://esperto.example/feed",
      opts,
    );
    expect(r).toMatchObject({ kind: "network_error", blocked: false });
  });

  it("com onHop, a cota por hora é cobrada a cada salto de verdade, antes do pedido (fix round 2, achado N3)", async () => {
    const { http, calls } = createFakeHttp({
      "https://saltos.example/a": {
        status: 302,
        headers: { location: "https://saltos.example/b" },
      },
      "https://saltos.example/b": {
        status: 302,
        headers: { location: "https://saltos.example/c" },
      },
      "https://saltos.example/c": { body: "<rss/>" },
    });
    let hits = 0;
    const limitedRepo = {
      async hitRateLimit() {
        hits += 1;
        return hits <= 2;
      },
    };
    const r = await crawlGet(
      { repo: limitedRepo, http, resolve: fakeResolve(), userAgent: DEFAULT_USER_AGENT },
      "https://saltos.example/a",
      { ...opts, onHop: () => null },
    );
    expect(r.kind).toBe("rate_limited");
    expect(calls.map((c) => c.url)).toEqual([
      "https://saltos.example/a",
      "https://saltos.example/b",
    ]);
  });
});

describe("crawlGet com prefixBytes (sitemap)", () => {
  it("lê só o prefixo, devolve truncated e não baixa o resto", async () => {
    let pulled = 0;
    const http = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(c) {
            pulled++;
            c.enqueue(new TextEncoder().encode("<urlset>".padEnd(1024, " ")));
            if (pulled > 5000) c.close();
          },
        }),
        { headers: { "content-length": "5120000" } },
      );
    const r = await crawlGet(
      { repo, http, resolve: fakeResolve(), userAgent: DEFAULT_USER_AGENT },
      "https://a.example/sitemap.xml",
      { ...opts, prefixBytes: 4096 },
    );
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.truncated).toBe(true);
    expect(r.body.length).toBe(4096);
    expect(pulled).toBeLessThan(10);
  });

  it("documento pequeno vem inteiro e sem a marca truncated", async () => {
    const { http } = createFakeHttp({ "https://a.example/sitemap.xml": { body: "<urlset/>" } });
    const r = await crawlGet(
      { repo, http, resolve: fakeResolve(), userAgent: DEFAULT_USER_AGENT },
      "https://a.example/sitemap.xml",
      { ...opts, prefixBytes: 4096 },
    );
    expect(r).toMatchObject({ kind: "ok", body: "<urlset/>" });
    expect("truncated" in r).toBe(false);
  });
});
