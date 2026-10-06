import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HttpFetch } from "@/lib/pipeline/ports";
import { fixtureHttp, fixturesEnabled, realHttp } from "@/lib/sources/http-deps";
import { createOsmProvider, OVERPASS_URL } from "./osm";
import { siteUrl } from "@/lib/seo/jsonld";
import { createGoogleProvider } from "./google";
import { createTripadvisorProvider } from "./tripadvisor";
import type { VenueProvider } from "./types";

/**
 * Provedores de lugares para as rotas e as ações do Estúdio. Produção: Overpass real e, com a
 * variável `TRIPADVISOR_API_KEY` no ambiente, a Content API do TripAdvisor (sem a variável, só
 * pesquisa web e OpenStreetMap, R33). Com `CRAWLER_FIXTURES=1` (só fora de produção) nenhuma rede
 * é usada: o Overpass é um arquivo fictício em `tests/fixtures/guide` e os sites vêm de
 * `tests/fixtures/sites`.
 */

const FIXTURE_OVERPASS = "https://overpass.example/api/interpreter";

/** `fetch` falso do Overpass: devolve do arquivo fictício os elementos cujo nome casa com a busca. */
export function guideFixtureHttp(root = join(process.cwd(), "tests/fixtures")): HttpFetch {
  const sites = fixtureHttp(root);
  return async (rawUrl, init) => {
    const url = new URL(rawUrl);
    if (url.hostname !== "overpass.example") return sites(rawUrl, init);
    const file = join(root, "guide/overpass.json");
    const all = existsSync(file)
      ? (
          JSON.parse(readFileSync(file, "utf-8")) as {
            elements: { tags?: Record<string, string> }[];
          }
        ).elements
      : [];
    const query = url.searchParams.get("data") ?? "";
    const name = /\["name"~"((?:[^"\\]|\\.)*)",i\]/.exec(query)?.[1]?.replace(/\\(.)/g, "$1");
    const elements = name
      ? all.filter((e) => e.tags?.["name"]?.toLowerCase().includes(name.toLowerCase()))
      : all;
    return new Response(JSON.stringify({ elements }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

export function guideHttp(): HttpFetch {
  return fixturesEnabled() ? guideFixtureHttp() : realHttp;
}

export interface GuideProviders {
  /** `null` sem `GOOGLE_PLACES_API_KEY` ou no modo de fixtures. */
  google: (VenueProvider & { readonly enabled: boolean }) | null;
  osm: VenueProvider;
  /** `null` sem chave no ambiente (modo de pesquisa web). */
  tripadvisor: (VenueProvider & { readonly enabled: boolean }) | null;
}

export function buildProviders(
  opts: { onTaCall?: () => void; onGoogleCall?: () => void; googleCallsLeft?: () => number } = {},
): GuideProviders {
  const fixtures = fixturesEnabled();
  const http = guideHttp();
  const key = fixtures ? undefined : process.env.TRIPADVISOR_API_KEY;
  const googleKey = fixtures ? undefined : process.env.GOOGLE_PLACES_API_KEY;
  return {
    google: googleKey?.trim()
      ? createGoogleProvider({
          apiKey: googleKey,
          http,
          onError: (d) => console.warn(`google recusou (${d.status}): ${d.message}`),
          ...(opts.onGoogleCall ? { onCall: opts.onGoogleCall } : {}),
          ...(opts.googleCallsLeft ? { callsLeft: opts.googleCallsLeft } : {}),
        })
      : null,
    osm: createOsmProvider({
      http,
      url: fixtures ? FIXTURE_OVERPASS : OVERPASS_URL,
      ...(fixtures ? { minIntervalMs: 0 } : {}),
    }),
    tripadvisor: key?.trim()
      ? createTripadvisorProvider({
          apiKey: key,
          http,
          referer: siteUrl(),
          onError: (d) => console.warn(`tripadvisor recusou (${d.status}): ${d.message}`),
          ...(opts.onTaCall ? { onCall: opts.onTaCall } : {}),
        })
      : null,
  };
}
