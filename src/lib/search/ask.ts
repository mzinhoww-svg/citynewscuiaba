import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import {
  buildAnswer,
  type AiAnswer,
  type AnswerContext,
  type SourceCandidate,
} from "@/lib/ai/answer";
import { askBucket, ASK_LIMITS, askRetryAt, ASK_WINDOW_SECONDS } from "@/lib/ai/ask-limit";
import { createServerClient } from "@/lib/db/client";
import { many, one, readPublic, readService } from "@/lib/db/queries/run";
import { hitRateLimit } from "@/lib/db/writes";
import { articleSourceLabel, plaqueOf } from "@/lib/labels";
import { err, ok, type Result } from "@/lib/result";
import { clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";
import { BYLINE } from "@/content/pt-BR/portal-card";
import { minMatchFor, questionQuery } from "./query";
import { searchHits, type SearchDeps } from "./server";

/** Fontes consideradas por pergunta (a busca devolve mais; ficam as mais relevantes). */
const RETRIEVE_LIMIT = 30;

/**
 * Fontes da busca com IA: busca híbrida sem palavras de pergunta, sem patrocinado, só matérias e
 * itens de outros veículos, exigindo que cada fonte tenha a maior parte dos termos do assunto.
 */
export async function retrieveForAnswer(
  question: string,
  deps: SearchDeps = {},
): Promise<Result<SourceCandidate[], "unavailable">> {
  const q = questionQuery(question);
  const terms = q ? q.split(" ").length : 0;
  if (terms === 0) return ok([]);
  const found = await searchHits(q, {
    ...deps,
    filters: { type: "all", exclude_sponsored: true, min_match: minMatchFor(terms) },
    limit: RETRIEVE_LIMIT,
  });
  if (!found.ok) return err("unavailable");
  const hits = found.value.hits;

  const slugs = [
    ...new Set(hits.flatMap((h) => (h.kind === "aggregated" ? [h.item.sourceSlug] : []))),
  ];
  const reliability = await readPublic(async (db) =>
    slugs.length
      ? db.from("public_sources").select("slug, reliability").in("slug", slugs).then(many)
      : [],
  );
  const originals = await sourceTexts(
    hits.flatMap((h) => (h.kind === "aggregated" ? [h.item.id] : [])),
  );
  const primary = new Set(
    reliability.ok
      ? reliability.value.flatMap((s) => (s.reliability === "primary" && s.slug ? [s.slug] : []))
      : [],
  );

  return ok(
    hits.flatMap((h): SourceCandidate[] => {
      if (h.kind === "article") {
        const a = h.item;
        if (a.sponsored) return [];
        return [
          {
            id: a.id,
            kind: "article",
            title: a.title,
            url: a.href,
            sourceName: BYLINE.newsroom,
            publisher: "citynews",
            publishedAt: a.publishedAt,
            primary: false,
            sponsored: false,
            label: articleSourceLabel(a),
            text: [a.dek, ...(a.aiSummary ?? [])].join(" "),
          },
        ];
      }
      if (h.kind === "aggregated") {
        const g = h.item;
        const label = plaqueOf(g.labels);
        if (!label) return [];
        return [
          {
            id: g.id,
            kind: "aggregated",
            title: g.title,
            url: g.url,
            sourceName: g.sourceName,
            publisher: g.sourceSlug,
            publishedAt: g.publishedAt,
            primary: primary.has(g.sourceSlug),
            sponsored: false,
            label,
            text: g.summary ?? "",
            ...(originals.has(g.id) ? { sourceText: originals.get(g.id) } : {}),
          },
        ];
      }
      return [];
    }),
  );
}

/**
 * Texto da fonte dos agregados encontrados (`excerpt`, nunca público), lido com service role só
 * para fundamentar o modelo (A-051), e só de fonte com política `summary_2_sentences` (a mesma
 * que permite resumo). Sem service role, segue sem ele.
 */
async function sourceTexts(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0 || !process.env.SUPABASE_SERVICE_ROLE_KEY) return new Map();
  const r = await readService(async (db) =>
    db
      .from("collected_items")
      .select("id, excerpt, sources!inner(republish_policy)")
      .in("id", ids)
      .is("quarantined_at", null)
      .eq("sources.republish_policy", "summary_2_sentences")
      .then(many),
  );
  if (!r.ok) return new Map();
  return new Map(r.value.flatMap((row) => (row.excerpt?.trim() ? [[row.id, row.excerpt]] : [])));
}

/** `feature_flags.ai_enabled` (leitura pública). `null` = banco indisponível. */
async function aiEnabled(): Promise<boolean | null> {
  const r = await readPublic(async (db): Promise<boolean> => {
    const row = await db
      .from("feature_flags")
      .select("enabled")
      .eq("key", "ai_enabled")
      .maybeSingle()
      .then(one);
    return row?.enabled ?? false;
  });
  return r.ok ? r.value : null;
}

/**
 * Conta logada (60/h) ou visitante (20/h, chave = hash do IP com sal diário). `null` sem sal em
 * produção (A-051): a pergunta é recusada como indisponível, falha fechado.
 */
async function audienceKey(
  now: Date,
): Promise<{ audience: "anon" | "account"; key: string } | null> {
  const salt = rateLimitSalt();
  if (!salt) return null;
  const hasSession = (await cookies()).getAll().some((c) => c.name.startsWith("sb-"));
  if (hasSession) {
    try {
      const db = await createServerClient();
      const { data } = await db.auth.getUser();
      if (data.user) {
        const key = createHash("sha256").update(`${salt}:${data.user.id}`).digest("hex");
        return { audience: "account", key };
      }
    } catch {
      // Sessão inválida: conta como visitante.
    }
  }
  return { audience: "anon", key: ipKey(clientIp(await headers()), now, salt) };
}

export interface AskOutcome {
  answer: AiAnswer;
  /** Busca com IA desligada no Control Center (`ai_enabled = false`). */
  aiOff: boolean;
  /** Limite aplicado (20 sem conta, 60 com conta). */
  limit: number;
}

/**
 * Pergunte ao CityNews (P13): IA ligada → limite de uso → resposta com citações ou recusa.
 * Sem login. Nunca lança; sem banco ou sem IA, erro "indisponível" (a página mostra a busca
 * tradicional).
 */
export async function answerQuestion(question: string, now = new Date()): Promise<AskOutcome> {
  const enabled = await aiEnabled();
  if (enabled === false)
    return {
      answer: { kind: "error", reason: "unavailable" },
      aiOff: true,
      limit: ASK_LIMITS.anon,
    };
  if (enabled === null)
    return {
      answer: { kind: "error", reason: "unavailable" },
      aiOff: false,
      limit: ASK_LIMITS.anon,
    };

  const who = await audienceKey(now);
  if (!who)
    return {
      answer: { kind: "error", reason: "unavailable" },
      aiOff: false,
      limit: ASK_LIMITS.anon,
    };
  const { audience, key } = who;
  const limit = ASK_LIMITS[audience];
  const allowed = await hitRateLimit(askBucket(audience), key, limit, ASK_WINDOW_SECONDS);
  if (!allowed.ok) return { answer: { kind: "error", reason: "unavailable" }, aiOff: false, limit };
  if (!allowed.value)
    return {
      answer: { kind: "error", reason: "rate_limited", retryAt: askRetryAt(now) },
      aiOff: false,
      limit,
    };

  try {
    const { createProductionAi } = await import("@/lib/ai/server");
    const ai = createProductionAi();
    const ctx: AnswerContext = {
      retrieve: (q) => retrieveForAnswer(q, { embed: embedWith(ai.embedOne) }),
      callAgent: ai.callAgent,
      now: () => now,
    };
    return { answer: await buildAnswer(question, ctx), aiOff: false, limit };
  } catch {
    return { answer: { kind: "error", reason: "unavailable" }, aiOff: false, limit };
  }
}

const EMBED_TIMEOUT_MS = 1500;

function embedWith(
  embedOne: (t: string) => Promise<{ ok: true; value: number[] } | { ok: false; error: string }>,
) {
  return async (q: string): Promise<number[] | null> => {
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), EMBED_TIMEOUT_MS));
    const res = await Promise.race([embedOne(q).catch(() => null), timeout]);
    return res && res.ok ? res.value : null;
  };
}
