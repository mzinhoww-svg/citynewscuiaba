import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CrawlDeps } from "@/lib/pipeline/http";
import type { SourceKind } from "@/lib/pipeline/ports";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";
import { testConnection, type TestConnectionSource } from "./test-connection";

function read(fixture: string): string {
  return readFileSync(join(process.cwd(), "tests/fixtures/feeds", fixture), "utf-8");
}

function xml(body: string): FakeRoute {
  return { body, headers: { "content-type": "application/rss+xml" } };
}
function status(code: number): FakeRoute {
  return { status: code };
}
function robotsOk(host: string): Record<string, FakeRoute> {
  return { [`https://${host}/robots.txt`]: { body: "User-agent: *\nAllow: /" } };
}

function deps(http: ReturnType<typeof createFakeHttp>["http"]): CrawlDeps & { now: () => number } {
  const hits = new Map<string, number>();
  let clock = 0;
  return {
    repo: {
      async hitRateLimit(bucket, limit) {
        const n = (hits.get(bucket) ?? 0) + 1;
        hits.set(bucket, n);
        return n <= limit;
      },
    },
    http,
    resolve: fakeResolve(),
    userAgent: "CityNewsBot/1.0",
    now: () => (clock += 1),
  };
}

function src(feedUrl: string, kind: SourceKind = "rss"): TestConnectionSource {
  return { kind, feedUrl, baseUrl: new URL(feedUrl).origin };
}

const folhaOk = createFakeHttp({
  ...robotsOk("folhadocerrado.example"),
  "https://folhadocerrado.example/feed": xml(read("folha-do-cerrado.xml")),
}).http;

describe("testConnection", () => {
  it("devolve o Crawl-delay lido do robots.txt (spec §7.8.1, FS-T6)", async () => {
    const { http } = createFakeHttp({
      "https://folhadocerrado.example/robots.txt": {
        body: "User-agent: *\nCrawl-delay: 600\nAllow: /",
      },
      "https://folhadocerrado.example/feed": xml(read("folha-do-cerrado.xml")),
    });
    const r = await testConnection(src("https://folhadocerrado.example/feed"), deps(http));
    expect(r).toMatchObject({ ok: true, crawlDelaySec: 600 });
    const plain = await testConnection(src("https://folhadocerrado.example/feed"), deps(folhaOk));
    expect(plain.crawlDelaySec).toBeNull();
  });

  it("403: acesso negado", async () => {
    const { http } = createFakeHttp({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/feed": status(403),
    });
    const r = await testConnection(src("https://mtagora.example/feed"), deps(http));
    expect(r.message).toBe("Acesso negado pela fonte (403)");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });

  it("404: endereço não encontrado", async () => {
    const { http } = createFakeHttp({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/feed": status(404),
    });
    const r = await testConnection(src("https://mtagora.example/feed"), deps(http));
    expect(r.message).toBe("Endereço não encontrado (404)");
  });

  it("sucesso: conta os itens extraídos", async () => {
    const r = await testConnection(src("https://folhadocerrado.example/feed"), deps(folhaOk));
    expect(r).toMatchObject({ ok: true, items: 25, message: "Conexão ok: 25 itens" });
  });

  it("robots.txt bloqueando o caminho", async () => {
    const { http } = createFakeHttp({
      "https://mtagora.example/robots.txt": { body: "User-agent: *\nDisallow: /feed" },
    });
    const r = await testConnection(src("https://mtagora.example/feed"), deps(http));
    expect(r).toEqual({
      ok: false,
      status: 0,
      items: 0,
      ms: expect.any(Number),
      message: "O robots.txt da fonte não permite a coleta deste endereço",
      crawlDelaySec: null,
    });
  });

  it("limite de requisições por hora atingido", async () => {
    const { http } = createFakeHttp({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/feed": xml(""),
    });
    const d = deps(http);
    let calls = 0;
    d.repo = {
      async hitRateLimit() {
        calls += 1;
        return calls <= 1;
      },
    };
    const r = await testConnection(src("https://mtagora.example/feed"), d);
    expect(r.message).toBe("Limite de requisições por hora atingido");
  });

  it("formato não reconhecido", async () => {
    const { http } = createFakeHttp({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/feed": {
        body: "isto não é um feed",
        headers: { "content-type": "text/plain" },
      },
    });
    const r = await testConnection(src("https://mtagora.example/feed"), deps(http));
    expect(r.message).toBe("Formato não reconhecido");
  });

  it("nenhuma notícia encontrada", async () => {
    const { http } = createFakeHttp({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/feed": xml(
        '<?xml version="1.0"?><rss version="2.0"><channel><title>Vazio</title></channel></rss>',
      ),
    });
    const r = await testConnection(src("https://mtagora.example/feed"), deps(http));
    expect(r.message).toBe("Nenhuma notícia encontrada neste endereço");
  });

  it("plural: 1 item no singular, sem quebrar o texto do briefing (achado 8)", async () => {
    const { http } = createFakeHttp({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/feed": xml(
        `<?xml version="1.0"?><rss version="2.0"><channel><title>Um item</title>
          <item><title>Matéria única</title><link>https://mtagora.example/materia-unica</link></item>
        </channel></rss>`,
      ),
    });
    const r = await testConnection(src("https://mtagora.example/feed"), deps(http));
    expect(r).toMatchObject({ ok: true, items: 1, message: "Conexão ok: 1 item" });
  });

  it("endereço proibido (SSRF): mensagem própria, nunca 'não respondeu' (achado 9)", async () => {
    const { http, calls } = createFakeHttp({});
    const r = await testConnection(src("http://127.0.0.1/feed"), deps(http));
    expect(r.message).toBe("Este endereço não é permitido.");
    expect(calls).toHaveLength(0);
  });

  it("feedUrl inválido não lança: devolve um resultado (achado 10)", async () => {
    const { http } = createFakeHttp({});
    const invalid: TestConnectionSource = {
      kind: "rss",
      feedUrl: "não é uma url",
      baseUrl: "https://mtagora.example",
    };
    const r = await testConnection(invalid, deps(http));
    expect(r.ok).toBe(false);
    expect(r.message).toBe("Endereço da fonte inválido.");
  });

  it("respeita a estratégia page_list: usa os seletores da fonte (achado 8/consumption)", async () => {
    const { http } = createFakeHttp({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/cidades": {
        body: readFileSync(
          join(process.cwd(), "tests/fixtures/sites/secao-mt-agora.html"),
          "utf-8",
        ),
        headers: { "content-type": "text/html" },
      },
    });
    const withPageList: TestConnectionSource = {
      kind: "page",
      feedUrl: "https://mtagora.example/cidades",
      baseUrl: "https://mtagora.example",
      consumption: {
        strategy: "page_list",
        pageSelectors: { item: "article.card", link: "a", title: "h2", date: "time" },
      },
    };
    const r = await testConnection(withPageList, deps(http));
    expect(r).toMatchObject({ ok: true, items: 3, message: "Conexão ok: 3 itens" });
  });

  it("bucket por pessoa quando callerId é passado (achado 14)", async () => {
    const { http } = createFakeHttp({
      ...robotsOk("mtagora.example"),
      "https://mtagora.example/feed": xml(""),
    });
    const seenBuckets: string[] = [];
    const d = deps(http);
    d.repo = {
      async hitRateLimit(bucket) {
        seenBuckets.push(bucket);
        return true;
      },
    };
    await testConnection(src("https://mtagora.example/feed"), { ...d, callerId: "user-123" });
    expect(seenBuckets.every((b) => b === "test-connection:user-123")).toBe(true);
  });
});
