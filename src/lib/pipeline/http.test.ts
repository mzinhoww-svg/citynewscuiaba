import { crawlGet, DEFAULT_USER_AGENT, isForbiddenHost, MAX_DOCUMENT_BYTES } from "./http";
import { createFakeHttp } from "./testing/fake-http";

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
      { repo, http, userAgent: DEFAULT_USER_AGENT },
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
      { repo, http, userAgent: DEFAULT_USER_AGENT },
      "https://a.example/feed",
      opts,
    );
    expect(r.kind).toBe("too_large");
  });

  it("identificação padrão do robô", () =>
    expect(DEFAULT_USER_AGENT).toMatch(/^CityNewsBot\/1\.0/));
});
