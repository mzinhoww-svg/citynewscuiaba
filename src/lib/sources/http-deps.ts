/**
 * Dependências de rede do painel de fontes (análise por link, teste de conexão, ativação).
 * Produção: `fetch` real atrás de `crawlGet`/`checkRobots` (SSRF em `pipeline/net.ts`).
 * Com `CRAWLER_FIXTURES=1` **fora de produção** (e2e), um `FakeHttp` serve `tests/fixtures/sites`
 * e `tests/fixtures/feeds` para hosts `*.example` e recusa qualquer outro host: nenhum acesso à
 * rede. Em produção a variável é ignorada (teste em `analyze.test.ts`).
 */
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { CrawlDeps } from "@/lib/pipeline/http";
import { crawlerUserAgent } from "@/lib/pipeline/http";
import { systemResolve, type ResolveHost } from "@/lib/pipeline/net";
import type { HttpFetch, IngestRepo } from "@/lib/pipeline/ports";
import { FAKE_PUBLIC_IP } from "@/lib/pipeline/testing/fake-http";

/** `fetch` real (identidade comparável nos testes). */
export const realHttp: HttpFetch = (url, init) => fetch(url, init);

type Env = Partial<Record<"CRAWLER_FIXTURES" | "NODE_ENV", string | undefined>>;

export function fixturesEnabled(env: Env = process.env): boolean {
  return env.CRAWLER_FIXTURES === "1" && env.NODE_ENV !== "production";
}

/**
 * Host fictício (sem `www.`) → prefixo dos arquivos em `tests/fixtures/sites`. Convenção por
 * prefixo: `/` → `<p>-home.html`, `/robots.txt` → `<p>-robots.txt`, `/feed` e `/rss` →
 * `<p>-feed.xml`, `/<caminho>` → `<p>-<caminho>.html`. `EXTRA` cobre fixtures anteriores ao painel.
 */
const SITES: Record<string, string> = {
  "folhadocerrado.example": "folha",
  "portalvarzea.example": "portal-varzea",
  "mtagora.example": "mt-agora",
  "vozdocoxipo.example": "voz-do-coxipo",
  "jornaldachapada.example": "jornal-da-chapada",
  "proibido.example": "proibido",
  "cadencia.example": "cadencia",
  // Coletor da Agenda (AGE-T1).
  "cerradovivo.example": "cerrado-vivo",
  "bloqueado-agenda.example": "bloqueado-agenda",
};

const EXTRA: Record<string, Record<string, string>> = {
  "culturavarzea.example": { "/calendario.ics": "agenda/cultura-varzea.ics" },
  "agendamt.example": { "/feed": "agenda/agenda-mt-feed.xml" },
  "ingressosmt.example": { "/eventos/cuiaba-mt": "agenda/ingressos-cuiaba.html" },
  "folhadocerrado.example": {
    "/feed": "feeds/folha-do-cerrado.xml",
    "/termos": "sites/termos.html",
  },
  "portalvarzea.example": {
    "/sitemap-noticias.xml": "feeds/portal-varzea.xml",
    "/feed": "feeds/portal-varzea.xml",
  },
  "mtagora.example": {
    "/cidades": "sites/secao-mt-agora.html",
    "/sitemap-news.xml": "feeds/mt-agora.xml",
  },
};

const CONTENT_TYPE: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".ics": "text/calendar; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function candidates(host: string, path: string): string[] {
  const prefix = SITES[host];
  const out: string[] = [];
  const extra = EXTRA[host]?.[path];
  if (extra) out.push(extra);
  if (!prefix) return out;
  if (path === "/" || path === "") out.push(`sites/${prefix}-home.html`);
  else if (path === "/robots.txt") out.push(`sites/${prefix}-robots.txt`);
  else if (path === "/feed" || path === "/rss") out.push(`sites/${prefix}-feed.xml`);
  else {
    const slug = path.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9-]+/gi, "-");
    if (slug) out.push(`sites/${prefix}-${slug}.html`, `sites/${prefix}-${slug}.xml`);
  }
  return out;
}

/** `fetch` falso sobre as fixtures fictícias; recusa hosts fora de `*.example`. */
export function fixtureHttp(root = join(process.cwd(), "tests/fixtures")): HttpFetch {
  return async (rawUrl, init) => {
    init.signal?.throwIfAborted();
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.endsWith(".example")) {
      throw new TypeError(`fetch failed: sem rede no modo de fixtures (${url.hostname})`);
    }
    for (const rel of candidates(host, url.pathname)) {
      const file = join(root, rel);
      if (!existsSync(file)) continue;
      const type = CONTENT_TYPE[extname(file)] ?? "application/octet-stream";
      return new Response(readFileSync(file, "utf-8"), {
        status: 200,
        headers: { "content-type": type },
      });
    }
    return new Response("não encontrado", { status: 404 });
  };
}

/** DNS no modo de fixtures: `*.example` resolve para um IP público de documentação. */
const fixtureResolve: ResolveHost = async (host) =>
  host.toLowerCase().endsWith(".example") ? [FAKE_PUBLIC_IP] : systemResolve(host);

export function crawlDeps(opts: { repo: Pick<IngestRepo, "hitRateLimit">; env?: Env }): CrawlDeps {
  const fixtures = fixturesEnabled(opts.env ?? process.env);
  return {
    repo: opts.repo,
    http: fixtures ? fixtureHttp() : realHttp,
    resolve: fixtures ? fixtureResolve : systemResolve,
    userAgent: crawlerUserAgent(),
  };
}
