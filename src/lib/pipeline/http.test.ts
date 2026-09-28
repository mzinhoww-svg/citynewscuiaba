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
});
