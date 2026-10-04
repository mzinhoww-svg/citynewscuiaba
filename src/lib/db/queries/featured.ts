import "server-only";
import type { DbClient } from "@/lib/db/client";
import {
  DEFAULT_SLOTS,
  hasApprovedCover,
  resolveSlot,
  type Candidate,
  type FeaturedPage,
  type Pin,
  type Resolved,
  type Slot,
  type SlotKey,
} from "@/lib/featured";
import { ARTICLE_COLUMNS, PUBLIC_STATUSES, fetchRecentArticles, summarize } from "./articles";
import { many } from "./run";
import type { ArticleSummary } from "./types";

/*
 * Destaques por posição (FD-T2): lê os pinos (`featured_items`) e a lista de candidatas e pede o
 * resultado ao domínio puro (`src/lib/featured`). Nunca lança: com a tabela vazia ou a consulta
 * falhando devolve `items: []` e quem chama cai no comportamento anterior da página.
 */

/** Candidatas lidas por posição: o suficiente para 2 dias de publicação. */
const POOL_SIZE = 80;
/** No máximo estas matérias sem capa viram pedido de busca de imagem por renderização (R39). */
const IMAGE_REQUESTS = 3;

export interface FeaturedResult {
  items: ArticleSummary[];
  source: Resolved["source"];
  /** Quando a posição será reavaliada; `null` = até remover. */
  until: Date | null;
  /** Pinos que não puderam ocupar a posição (saiu do ar, sem capa), para o aviso do admin. */
  dropped: Resolved["dropped"];
  needsImage: string[];
  /** Mensagem quando a leitura falhou (a página cai no comportamento anterior). */
  error?: string;
}

export interface GetFeaturedOpts {
  /** Editoria da posição (`editoria.lead`). */
  section?: string;
  now?: Date;
  /** Matérias já carregadas pela página (evita reler); sem isso, a posição lê as dela. */
  pool?: readonly ArticleSummary[];
  /** Matérias que já estão em outro lugar da página (urgência, manchete): ficam de fora. */
  exclude?: readonly string[];
}

export const EMPTY_FEATURED: FeaturedResult = {
  items: [],
  source: "automatic",
  until: null,
  dropped: [],
  needsImage: [],
};

/** Resumo de matéria → candidata do domínio (capa aprovada, escopo, confiança, fontes). */
export function toCandidate(a: ArticleSummary): Candidate {
  return {
    id: a.id,
    publishedAt: new Date(a.publishedAt),
    sectionSlug: a.section.slug,
    confidenceScore: a.confidence.score,
    sourceCount: a.sourceCount,
    sponsored: a.sponsored,
    hasCover: hasApprovedCover(a.image),
    newsScope: a.newsScope ?? null,
    nationalCommotion: a.nationalCommotion ?? false,
  };
}

export interface PinRow {
  id: string;
  slot_key: string;
  section_slug: string | null;
  article_id: string;
  position: number;
  starts_at: string;
  ends_at: string | null;
  ended_at: string | null;
}

export function toPin(r: PinRow): Pin {
  return {
    id: r.id,
    slotKey: r.slot_key,
    sectionSlug: r.section_slug,
    articleId: r.article_id,
    position: r.position,
    startsAt: new Date(r.starts_at),
    endsAt: r.ends_at ? new Date(r.ends_at) : null,
    endedAt: r.ended_at ? new Date(r.ended_at) : null,
  };
}

/** Parte pura: quem ocupa a posição, dadas as linhas já lidas. */
export function resolveFeatured(input: {
  slot: Slot;
  section?: string;
  pins: readonly Pin[];
  pool: readonly ArticleSummary[];
  now: Date;
  exclude?: readonly string[];
}): FeaturedResult {
  const skip = new Set(input.exclude ?? []);
  const articles = input.pool.filter((a) => !skip.has(a.id));
  const byId = new Map(articles.map((a) => [a.id, a]));
  const r = resolveSlot({
    slot: input.slot,
    section: input.section,
    pins: input.pins,
    candidates: articles.map(toCandidate),
    now: input.now,
    eligible: (id) => byId.has(id),
  });
  return {
    items: r.items.flatMap((c) => byId.get(c.id) ?? []),
    source: r.source,
    until: r.until,
    dropped: r.dropped,
    needsImage: r.needsImage,
  };
}

async function loadSlot(db: DbClient, key: SlotKey): Promise<Slot | null> {
  const rows = await db
    .from("featured_slots")
    .select("key, page, label, capacity")
    .eq("key", key)
    .then(many);
  const row = rows[0];
  if (row) {
    return {
      key: row.key,
      page: row.page as FeaturedPage,
      label: row.label,
      capacity: row.capacity,
    };
  }
  return DEFAULT_SLOTS.find((s) => s.key === key) ?? null;
}

/** Editoria e filhas (a posição de uma editoria vale para as subeditorias dela). */
async function sectionSlugs(db: DbClient, slug: string): Promise<string[]> {
  const rows = await db.from("sections").select("slug, parent_slug").then(many);
  return [slug, ...rows.filter((s) => s.parent_slug === slug).map((s) => s.slug)];
}

async function loadPool(db: DbClient, slot: Slot, section?: string): Promise<ArticleSummary[]> {
  if (slot.page === "editoria") {
    if (!section) return [];
    const slugs = await sectionSlugs(db, section);
    const rows = await db
      .from("articles")
      .select(ARTICLE_COLUMNS)
      .in("status", [...PUBLIC_STATUSES])
      .contains("publish_destinations", ["section"])
      .in("section_slug", slugs)
      .order("published_at", { ascending: false })
      .limit(POOL_SIZE)
      .then(many);
    return summarize(db, rows);
  }
  const rows = await fetchRecentArticles(db, POOL_SIZE, slot.page === "home" ? "home" : undefined);
  return summarize(db, rows);
}

/**
 * Quem ocupa a posição `slotKey` agora: pino manual > pauta quente > automático por janela
 * (R8, R28, R39). Não lança.
 */
export async function getFeatured(
  db: DbClient,
  slotKey: SlotKey,
  opts: GetFeaturedOpts = {},
): Promise<FeaturedResult> {
  const now = opts.now ?? new Date();
  try {
    const slot = await loadSlot(db, slotKey);
    if (!slot) return EMPTY_FEATURED;

    let pinQuery = db
      .from("featured_items")
      .select("id, slot_key, section_slug, article_id, position, starts_at, ends_at, ended_at")
      .eq("slot_key", slot.key)
      .is("ended_at", null);
    pinQuery = opts.section
      ? pinQuery.eq("section_slug", opts.section)
      : pinQuery.is("section_slug", null);
    const pins = (await pinQuery.then(many)).map(toPin);

    const pool = [...(opts.pool ?? (await loadPool(db, slot, opts.section)))];
    // Matéria pinada pode ser mais antiga que a lista lida: traz só as que faltam.
    const missing = [...new Set(pins.map((p) => p.articleId))].filter(
      (id) => !pool.some((a) => a.id === id),
    );
    if (missing.length) {
      const rows = await db
        .from("articles")
        .select(ARTICLE_COLUMNS)
        .in("id", missing)
        .in("status", [...PUBLIC_STATUSES])
        .then(many);
      pool.push(...(await summarize(db, rows)));
    }

    const result = resolveFeatured({
      slot,
      section: opts.section,
      pins,
      pool,
      now,
      exclude: opts.exclude,
    });
    if (result.needsImage.length) {
      // Melhor esforço: a falha do pedido nunca derruba a página.
      await db
        .rpc("featured_request_images", { p_ids: result.needsImage.slice(0, IMAGE_REQUESTS) })
        .then(
          () => undefined,
          () => undefined,
        );
    }
    return result;
  } catch (e) {
    return { ...EMPTY_FEATURED, error: e instanceof Error ? e.message : String(e) };
  }
}
