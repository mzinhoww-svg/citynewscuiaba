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
import { fixtureShiftDays, shiftFixtureDates } from "./fixture-dates";

/** `fetch` real (identidade comparável nos testes). */
export const realHttp: HttpFetch = (url, init) => fetch(url, init);

type Env = Partial<
  Record<"CRAWLER_FIXTURES" | "CRAWLER_FIXTURES_DATES" | "NODE_ENV", string | undefined>
>;

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
  // Coletor multifonte (AGM-T5): casa fictícia lida pelo caminho `ai_page`.
  "teatro-cerrado.example": "teatro-cerrado",
  // Proposta por link do Guia (GUIA-T4): portal fictício com uma lista de padarias.
  "saboresmt.example": "sabores-mt",
};

const EXTRA: Record<string, Record<string, string>> = {
  "culturavarzea.example": { "/calendario.ics": "agenda/cultura-varzea.ics" },
  "agendamt.example": { "/feed": "agenda/agenda-mt-feed.xml" },
  "ingressosmt.example": { "/eventos/cuiaba-mt": "agenda/ingressos-cuiaba.html" },
  "eventos-cerrado.example": {
    "/wp-json/tribe/events/v1/events": "sites/eventos-cerrado-tribe.json",
    "/wp-content/uploads/2026/10/sarau.jpg": "images/reproducao-b-1500x1000.jpg",
  },
  // Imagens de divulgação dos eventos fictícios (ARD-T2).
  "cerradovivo.example": { "/img/siriri-moderno.jpg": "images/reproducao-1600x900.jpg" },
  "teatro-cerrado.example": { "/img/forro-da-praca.jpg": "images/reproducao-c-1280x720.jpg" },
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
  ".jpg": "image/jpeg",
  ".png": "image/png",
};

/** Fixtures binárias: servidas como bytes, sem conversão de texto nem troca de datas. */
const BINARY = new Set([".jpg", ".png"]);

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

/**
 * Sites fictícios de eventos cujas datas acompanham o calendário com
 * `CRAWLER_FIXTURES_DATES=relative` (`fixture-dates.ts`). Feeds de notícia ficam como estão.
 */
export const AGENDA_FIXTURE_HOSTS: ReadonlySet<string> = new Set([
  "cerradovivo.example",
  "bloqueado-agenda.example",
  "teatro-cerrado.example",
  "culturavarzea.example",
  "agendamt.example",
  "ingressosmt.example",
  "eventos-cerrado.example",
]);

export interface FixtureHttpOptions {
  /** Dias somados às datas das páginas de eventos (múltiplo de 7; 0 = como no arquivo). */
  shiftDays?: number;
}

/** `fetch` falso sobre as fixtures fictícias; recusa hosts fora de `*.example`. */
export function fixtureHttp(
  root = join(process.cwd(), "tests/fixtures"),
  options: FixtureHttpOptions = {},
): HttpFetch {
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
      if (BINARY.has(extname(file)))
        return new Response(new Uint8Array(readFileSync(file)), {
          status: 200,
          headers: { "content-type": type },
        });
      const raw = readFileSync(file, "utf-8");
      const body =
        options.shiftDays && AGENDA_FIXTURE_HOSTS.has(host)
          ? shiftFixtureDates(raw, options.shiftDays)
          : raw;
      return new Response(body, {
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
  const env = opts.env ?? process.env;
  const fixtures = fixturesEnabled(env);
  // Datas relativas (e2e e integração com relógio real): calculadas a cada coleta.
  const shiftDays =
    env.CRAWLER_FIXTURES_DATES === "relative" ? fixtureShiftDays(new Date()) : undefined;
  return {
    repo: opts.repo,
    http: fixtures ? fixtureHttp(undefined, { shiftDays }) : realHttp,
    resolve: fixtures ? fixtureResolve : systemResolve,
    userAgent: crawlerUserAgent(),
  };
}
