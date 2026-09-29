import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readFixture } from "../../../tests/fixtures/read";
import { DEFAULT_USER_AGENT, type CrawlDeps } from "@/lib/pipeline/http";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import { createMemoryIngestRepo } from "@/lib/pipeline/testing/memory-ingest-repo";
import { testConnection } from "./test-connection";

const site = (n: string) => readFileSync(join(process.cwd(), "tests/fixtures/sites", n), "utf8");
const deps = (routes: Record<string, FakeRoute>) => {
  const { http, calls } = createFakeHttp(routes);
  let t = 1000;
  const d: CrawlDeps & { now: () => number } = {
    repo: createMemoryIngestRepo([]),
    http,
    resolve: fakeResolve(),
    userAgent: DEFAULT_USER_AGENT,
    now: () => (t += 120),
  };
  return { d, calls };
};
const robotsOk = (host: string) => ({
  [`https://${host}/robots.txt`]: { body: "User-agent: *\nDisallow: /admin" },
});
const src = (feedUrl: string, baseUrl = new URL(feedUrl).origin) => ({
  kind: "rss" as const,
  feedUrl,
  baseUrl,
});
const rss = {
  body: readFixture("folha-do-cerrado.xml"),
  headers: { "content-type": "application/rss+xml" },
};

describe("testConnection", () => {
  it("sucesso: conta itens e mede o tempo", async () => {
    const { d } = deps({
      ...robotsOk("folhadocerrado.example"),
      "https://folhadocerrado.example/feed": rss,
    });
    expect(await testConnection(src("https://folhadocerrado.example/feed"), d)).toMatchObject({
      ok: true,
      status: 200,
      items: 25,
      message: "Conexão ok: 25 itens",
    });
  });
  it("403 e 404 com mensagens em pt-BR", async () => {
    const a = deps({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/feed": { status: 403 },
    });
    expect(await testConnection(src("https://mtagora.example/feed"), a.d)).toMatchObject({
      ok: false,
      status: 403,
      message: "Acesso negado pela fonte (403)",
    });
    const b = deps({ ...robotsOk("mtagora.example") });
    expect((await testConnection(src("https://mtagora.example/feed"), b.d)).message).toBe(
      "Endereço não encontrado (404)",
    );
  });
  it("timeout, formato desconhecido e página vazia", async () => {
    const { http } = createFakeHttp({ ...robotsOk("lento.example") });
    const slow: CrawlDeps & { now: () => number } = {
      repo: createMemoryIngestRepo([]),
      http: async (url, init) => {
        if (url.endsWith("robots.txt")) return http(url, init);
        throw Object.assign(new Error("The operation was aborted due to timeout"), {
          name: "TimeoutError",
        });
      },
      resolve: fakeResolve(),
      userAgent: DEFAULT_USER_AGENT,
      now: () => 0,
    };
    expect((await testConnection(src("https://lento.example/feed"), slow)).message).toBe(
      "A fonte não respondeu em 10 s",
    );
    const unknown = deps({
      ...robotsOk("x.example"),
      "https://x.example/feed": { body: "isto não é feed" },
    });
    expect((await testConnection(src("https://x.example/feed"), unknown.d)).message).toBe(
      "Formato não reconhecido",
    );
    const empty = deps({
      ...robotsOk("x.example"),
      "https://x.example/feed": {
        body: '<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>',
      },
    });
    expect((await testConnection(src("https://x.example/feed"), empty.d)).message).toBe(
      "Nenhuma notícia encontrada neste endereço",
    );
  });
  it("robots que proíbe não baixa o feed", async () => {
    const { d, calls } = deps({
      "https://proibido.example/robots.txt": { body: site("proibido-robots.txt") },
    });
    const r = await testConnection(src("https://proibido.example/feed"), d);
    expect(r.message).toBe("O robots.txt da fonte não permite a coleta deste endereço");
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
  it("endereço interno é recusado sem requisição", async () => {
    const { d, calls } = deps({});
    const r = await testConnection(
      src("http://169.254.169.254/feed", "https://noticias.example"),
      d,
    );
    expect(r).toMatchObject({ ok: false, message: "Este endereço não é permitido." });
    expect(calls.some((c) => c.url.includes("169.254"))).toBe(false);
  });
  it("página com seletores lista itens sem corpo", async () => {
    const { d } = deps({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/cidades": {
        body: readFileSync(join(process.cwd(), "tests/fixtures/sites/secao-mt-agora.html"), "utf8"),
      },
    });
    const r = await testConnection(
      {
        kind: "page",
        feedUrl: null,
        baseUrl: "https://mtagora.example/cidades",
        consumption: {
          strategy: "page_list",
          page: { item: "article.card", link: "a", title: "h2", date: "time" },
        },
      },
      d,
    );
    expect(r.ok).toBe(true);
    expect(r.items).toBeGreaterThan(0);
  });
  it("limite por hora", async () => {
    const { d } = deps({
      ...robotsOk("folhadocerrado.example"),
      "https://folhadocerrado.example/feed": rss,
    });
    let last = "";
    for (let i = 0; i < 16; i++)
      last = (await testConnection(src("https://folhadocerrado.example/feed"), d)).message;
    expect(last).toBe("Limite de requisições por hora atingido");
  });
});
