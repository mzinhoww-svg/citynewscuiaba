import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createServiceClient } from "@/lib/db/client";
import { createIngestRepo } from "@/lib/db/pipeline-store";
import { crawlerUserAgent, type CrawlDeps } from "@/lib/pipeline/http";
import { systemResolve } from "@/lib/pipeline/net";
import type { HttpFetch, IngestRepo } from "@/lib/pipeline/ports";
import { createFakeHttp, fakeResolve, type FakeRoute } from "@/lib/pipeline/testing/fake-http";

type Env = Partial<Record<"NODE_ENV" | "CRAWLER_FIXTURES", string>>;

/**
 * `CRAWLER_FIXTURES=1` serve fixtures no lugar da rede, só fora de produção (e2e do painel).
 * Em produção a variável é ignorada: o painel nunca deixa de usar `fetch` real por engano.
 */
export function fixturesEnabled(env: Env = process.env): boolean {
  return env.CRAWLER_FIXTURES === "1" && env.NODE_ENV !== "production";
}

/** Hosts fictícios `*.example` e os arquivos de `tests/fixtures` que os servem (só e2e/dev). */
const FIXTURE_SITES: Record<string, Record<string, { file: string; type: string }>> = {
  "folhadocerrado.example": {
    "/robots.txt": { file: "sites/folha-robots.txt", type: "text/plain" },
    "/": { file: "sites/folha-home.html", type: "text/html" },
    "/feed": { file: "feeds/folha-do-cerrado.xml", type: "application/rss+xml" },
    "/termos-de-uso": { file: "sites/termos.html", type: "text/html" },
  },
  "portalvarzea.example": {
    "/robots.txt": { file: "sites/portal-varzea-robots.txt", type: "text/plain" },
    "/": { file: "sites/portal-varzea-home.html", type: "text/html" },
    "/atom.xml": { file: "feeds/portal-varzea.xml", type: "application/atom+xml" },
  },
  "mtagora.example": {
    "/robots.txt": { file: "sites/folha-robots.txt", type: "text/plain" },
    "/feed": { file: "feeds/mt-agora.xml", type: "application/rss+xml" },
    "/secao": { file: "sites/secao-mt-agora.html", type: "text/html" },
  },
  "proibido.example": {
    "/robots.txt": { file: "sites/proibido-robots.txt", type: "text/plain" },
  },
  // Criados pelas telas de nova fonte e do fluxo (FS-T8/FS-T9): sem o arquivo, a rota dá 404.
  "vozdocoxipo.example": {
    "/robots.txt": { file: "sites/voz-do-coxipo-robots.txt", type: "text/plain" },
    "/": { file: "sites/voz-do-coxipo-home.html", type: "text/html" },
    "/feed": { file: "sites/voz-do-coxipo-feed.xml", type: "application/rss+xml" },
  },
  "jornaldachapada.example": {
    "/robots.txt": { file: "sites/jornal-da-chapada-robots.txt", type: "text/plain" },
    "/": { file: "sites/jornal-da-chapada-secao.html", type: "text/html" },
  },
};

function fixtureRoutes(): Record<string, FakeRoute> {
  const routes: Record<string, FakeRoute> = {};
  const root = join(process.cwd(), "tests/fixtures");
  for (const [host, paths] of Object.entries(FIXTURE_SITES)) {
    for (const [path, { file, type }] of Object.entries(paths)) {
      const full = join(root, file);
      if (!existsSync(full)) continue;
      routes[`https://${host}${path}`] = {
        body: readFileSync(full, "utf8"),
        headers: { "content-type": type },
      };
    }
  }
  return routes;
}

/**
 * Dependências de rede das rotas do painel (análise de link, teste de conexão): `fetch` real, DNS do
 * sistema, `User-Agent` do CityNewsBot e limite por hora no banco. Nunca há `fetch` direto para URL de
 * terceiro fora de `crawlGet`/`checkRobots`, que revalidam cada salto (SSRF).
 */
export function crawlDeps(
  env: Env = process.env,
  overrides: { fetch?: typeof fetch; repo?: Pick<IngestRepo, "hitRateLimit"> } = {},
): CrawlDeps {
  const repo: Pick<IngestRepo, "hitRateLimit"> = overrides.repo ?? {
    hitRateLimit: (bucket, limit) =>
      createIngestRepo(createServiceClient()).hitRateLimit(bucket, limit),
  };
  const http: HttpFetch = fixturesEnabled(env)
    ? createFakeHttp(fixtureRoutes()).http
    : (url, init) => (overrides.fetch ?? fetch)(url, init);
  return {
    repo,
    http, // Fixtures `*.example` não existem no DNS: com elas, o resolvedor falso (só fora de produção).
    resolve: fixturesEnabled(env) ? fakeResolve() : systemResolve,
    userAgent: crawlerUserAgent(),
  };
}
