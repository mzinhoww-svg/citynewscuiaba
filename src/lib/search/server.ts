import "server-only";
import {
  didYouMean,
  fetchTopicsById,
  hydrateHits,
  rankSearch,
  suggestTitles,
  type RpcSearchFilters,
} from "@/lib/db/queries/search";
import { readPublic } from "@/lib/db/queries/run";
import type { QueryError } from "@/lib/db/queries/types";
import { ok, type Result } from "@/lib/result";
import { groupHits } from "./group";
import { normalizeQuery, queryTerms, type SearchFilters } from "./query";
import type { SearchGroup, SearchHit, SearchResult } from "./types";

export interface SearchDeps {
  /** Embedding da consulta; `null` = só texto (IA desligada, sem chave ou lenta). */
  embed?: (q: string) => Promise<number[] | null>;
}

/** Tempo máximo do embedding da consulta: a busca não espera a IA (P12: 300 ms p75). */
const EMBED_TIMEOUT_MS = 1200;

/**
 * Embedding de produção pela camada de IA (mesmo orçamento e registro). Sem service role, sem
 * IA ou acima do tempo, a busca segue só com texto.
 */
async function productionEmbed(q: string): Promise<number[] | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const { createProductionAi } = await import("@/lib/ai/server");
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), EMBED_TIMEOUT_MS),
    );
    const r = await Promise.race([createProductionAi().embedOne(q), timeout]);
    return r && r.ok ? r.value : null;
  } catch {
    return null;
  }
}

function rpcFilters(f: SearchFilters): RpcSearchFilters {
  return {
    type: f.type,
    origin: f.origin,
    ...(f.section ? { section: f.section } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.period !== "all" ? { period: f.period } : {}),
  };
}

export interface HitsOptions extends SearchDeps {
  filters: RpcSearchFilters;
  limit?: number;
}

/** Resultado plano, hidratado e em ordem de relevância (base da busca com IA). */
export async function searchHits(
  q: string,
  opts: HitsOptions,
): Promise<Result<{ hits: (SearchHit & { matched: number })[]; semantic: boolean }, QueryError>> {
  const query = normalizeQuery(q);
  if (queryTerms(query).length === 0) return ok({ hits: [], semantic: false });
  const embedding = await (opts.embed ?? productionEmbed)(query);
  return readPublic(async (db) => {
    const ranked = await rankSearch(db, query, embedding, opts.filters, opts.limit ?? 50);
    const hits = await hydrateHits(db, ranked);
    const matched = new Map(ranked.map((r) => [`${r.kind}:${r.id}`, r.matched]));
    return {
      hits: hits.map((h) => ({ ...h, matched: matched.get(`${h.kind}:${h.item.id}`) ?? 0 })),
      semantic: embedding !== null,
    };
  });
}

/**
 * Busca tradicional (P12, ADR-006): FTS em português sem acento + vetores, fundidos por RRF
 * (k = 60), com filtros e agrupamento por assunto. Nunca lança: sem banco, `Result` com erro.
 */
export async function searchHybrid(
  q: string,
  f: SearchFilters,
  deps: SearchDeps = {},
): Promise<Result<SearchResult, QueryError>> {
  const query = normalizeQuery(q);
  const empty: SearchResult = { query, groups: [], total: 0, didYouMean: null, semantic: false };
  if (queryTerms(query).length === 0) return ok(empty);
  const embedding = await (deps.embed ?? productionEmbed)(query);

  return readPublic(async (db) => {
    const ranked = await rankSearch(db, query, embedding, rpcFilters(f));
    const hits = await hydrateHits(db, ranked);
    if (hits.length === 0) {
      return { ...empty, didYouMean: await didYouMean(db, query), semantic: embedding !== null };
    }
    const byKey = new Map(hits.map((h) => [`${h.kind}:${h.item.id}`, h]));
    const visible = ranked.filter((r) => byKey.has(`${r.kind}:${r.id}`));
    const hitGroups = groupHits(visible);

    const topics = new Map(
      hits.flatMap((h) => (h.kind === "topic" ? [[h.item.id, h.item] as const] : [])),
    );
    const missing = [
      ...new Set(
        hitGroups.flatMap((g) => (g.topicId && !topics.has(g.topicId) ? [g.topicId] : [])),
      ),
    ];
    for (const t of await fetchTopicsById(db, missing)) topics.set(t.id, t);

    const groups: SearchGroup[] = hitGroups.flatMap((g) => {
      const items = g.hits.flatMap((h) => {
        const hit = byKey.get(`${h.kind}:${h.id}`);
        return hit ? [hit] : [];
      });
      if (items.length === 0) return [];
      const topic = g.topicId ? topics.get(g.topicId) : undefined;
      return [topic ? { topic, items } : { items }];
    });
    return { query, groups, total: hits.length, didYouMean: null, semantic: embedding !== null };
  });
}

/** Sugestões do autocomplete (títulos do acervo que começam com o que foi digitado). */
export async function suggest(prefix: string): Promise<Result<string[], QueryError>> {
  const p = normalizeQuery(prefix).slice(0, 80);
  if (p.replace(/[^\p{L}\p{N}]/gu, "").length < 2) return ok([]);
  return readPublic((db) => suggestTitles(db, p));
}
