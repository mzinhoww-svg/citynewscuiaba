import "server-only";
import { cache } from "react";
import { creditName, type CreditSource } from "@/lib/media/credit";
import { mediaHref } from "@/lib/media/serve";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { labelsFor, type ImageKind } from "@/lib/labels";
import type { Result } from "@/lib/result";
import { BYLINE } from "@/content/pt-BR/portal-card";
import { asScope } from "@/lib/geo/news-scope";
import { creditSourcesOfNode } from "@/lib/pipeline/steps/credit-line";
import { many, one, readPublic } from "./run";
import type {
  ArticleBlock,
  ArticleHistory,
  ArticleNote,
  ArticleImage,
  ArticleInlineImage,
  ArticleLookup,
  ArticleSource,
  ArticleSummary,
  ArticleView,
  QueryError,
  SectionRef,
} from "./types";

type ArticleRow = Pick<
  Database["public"]["Tables"]["articles"]["Row"],
  | "id"
  | "slug"
  | "kind"
  | "topic_id"
  | "section_slug"
  | "title"
  | "dek"
  | "body"
  | "ai_summary"
  | "ai_summary_reviewed_by"
  | "status"
  | "publish_mode"
  | "confidence"
  | "confidence_score"
  | "author_id"
  | "agent_id"
  | "urgent"
  | "sponsored"
  | "published_at"
  | "updated_at"
  | "seo_title"
  | "seo_description"
  | "news_scope"
  | "national_commotion"
  | "review_banner"
>;

export const ARTICLE_COLUMNS =
  "id, slug, kind, topic_id, section_slug, title, dek, body, ai_summary, ai_summary_reviewed_by, status, publish_mode, confidence, confidence_score, author_id, agent_id, urgent, sponsored, published_at, updated_at, seo_title, seo_description, news_scope, national_commotion, review_banner";

const MEDIA_COLUMNS =
  "article_id, alt, role, position, media_assets(id, kind, storage_path, origin_url, page_url, source_id, source_name, license, credit, status)";

/**
 * Colunas da matéria com as ligações de fonte e de mídia embutidas (UX-W5-T2): `summarize` não
 * precisa ler `article_sources` e `article_media` depois, e a hidratação cabe numa rodada só.
 */
export const ARTICLE_COLUMNS_HYDRATED =
  `${ARTICLE_COLUMNS}, article_sources(item_id), article_media(${MEDIA_COLUMNS})` as const;

type MediaRow = {
  article_id: string;
  alt: string | null;
  role: string;
  position: number | null;
  media_assets: {
    id: string;
    kind: Database["public"]["Enums"]["media_kind"];
    storage_path: string;
    origin_url: string | null;
    page_url: string | null;
    source_id: string | null;
    source_name: string | null;
    license: string;
    credit: string | null;
    status: string;
  } | null;
};

/** Linha de `articles`, com ou sem as ligações embutidas (`ARTICLE_COLUMNS_HYDRATED`). */
export type SummarizableRow = ArticleRow & {
  article_sources?: { item_id: string }[] | null;
  article_media?: MediaRow[] | null;
};

/** Destinos escolhidos na publicação (E06): a home e a editoria só listam o que foi para elas. */
export type PublicDestination = "home" | "section";

export const PUBLIC_STATUSES = ["published", "updated"] as const;

const WORDS_PER_MINUTE = 200;

const MEDIA_KIND: Record<Database["public"]["Enums"]["media_kind"], ImageKind> = {
  original: "original",
  reproduction: "reproduction",
  licensed: "licensed",
  illustrative: "illustrative",
  ai_generated: "ai_generated",
};

export function articleHref(slug: string): string {
  return `/materia/${slug}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function inlineText(node: unknown): string {
  if (!isRecord(node)) return "";
  if (node.type === "text" && typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map(inlineText).join("") : "";
}

/** Documento do editor (doc → paragraph/heading → text) em blocos simples de leitura. */
export function parseBody(body: unknown): ArticleBlock[] {
  if (!isRecord(body) || !Array.isArray(body.content)) return [];
  const blocks: ArticleBlock[] = [];
  for (const node of body.content) {
    if (!isRecord(node)) continue;
    const text = inlineText(node).trim();
    if (!text) continue;
    if (node.type === "heading") {
      const level = isRecord(node.attrs) && node.attrs.level === 3 ? 3 : 2;
      blocks.push({ type: "heading", level, text });
    } else if (node.type === "paragraph") {
      const credit = creditSourcesOfNode(node);
      if (credit) blocks.push({ type: "credit", text, sources: credit });
      else blocks.push({ type: "paragraph", text });
    }
  }
  return blocks;
}

function readMinutes(blocks: ArticleBlock[], dek: string): number {
  const words = [dek, ...blocks.map((b) => b.text)].join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function hostOf(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

interface Hydration {
  sections: Map<string, SectionRef>;
  names: Map<string, string>;
  sourceSlugs: Map<string, Set<string>>;
  /** Capa (`role = 'cover'`) por matéria. */
  images: Map<string, ArticleImage>;
  /** Imagem do texto (`role = 'inline'`) por matéria. */
  inlineImages: Map<string, ArticleInlineImage>;
}

async function fetchCreditSources(db: DbClient): Promise<CreditSource[]> {
  return db
    .from("public_sources")
    .select("id, name, base_url")
    .then(many)
    .then((rows) =>
      rows.flatMap((s) =>
        s.id && s.name && s.base_url ? [{ id: s.id, name: s.name, baseUrl: s.base_url }] : [],
      ),
    )
    .then(
      (v) => v,
      () => [],
    );
}

async function fetchItemSources(
  db: DbClient,
  itemIds: readonly string[],
): Promise<{ id: string | null; source_slug: string | null }[]> {
  return itemIds.length
    ? db
        .from("public_aggregated")
        .select("id, source_slug")
        .in("id", [...itemIds])
        .then(many)
    : [];
}

const hasReproduction = (media: readonly MediaRow[]) =>
  media.some((m) => m.media_assets?.kind === "reproduction");

/**
 * Seções, assinaturas, fontes e imagens das matérias. Com as ligações embutidas nas linhas
 * (`ARTICLE_COLUMNS_HYDRATED`) tudo sai numa rodada de leituras paralelas; linha sem elas lê
 * `article_sources`/`article_media` antes (uma rodada a mais).
 */
async function loadHydration(db: DbClient, rows: SummarizableRow[]): Promise<Hydration> {
  const people = [
    ...new Set(
      rows.flatMap((r) => [r.author_id, r.ai_summary_reviewed_by]).filter((v): v is string => !!v),
    ),
  ];
  const linkIds = rows.filter((r) => !Array.isArray(r.article_sources)).map((r) => r.id);
  const mediaIds = rows.filter((r) => !Array.isArray(r.article_media)).map((r) => r.id);
  const embeddedLinks = rows.flatMap((r) =>
    (r.article_sources ?? []).map((l) => ({ article_id: r.id, item_id: l.item_id })),
  );
  const embeddedMedia = rows.flatMap((r) =>
    (r.article_media ?? []).map((m) => ({ ...m, article_id: r.id })),
  );
  const embeddedItems = [...new Set(embeddedLinks.map((l) => l.item_id))];

  const [sectionRows, bylines, fetchedLinks, fetchedMedia, firstItems, firstCredits] =
    await Promise.all([
      db.from("sections").select("slug, name").then(many),
      people.length
        ? db.from("public_bylines").select("id, display_name").in("id", people).then(many)
        : Promise.resolve([]),
      linkIds.length
        ? db
            .from("article_sources")
            .select("article_id, item_id")
            .in("article_id", linkIds)
            .then(many)
        : Promise.resolve([]),
      mediaIds.length
        ? db.from("article_media").select(MEDIA_COLUMNS).in("article_id", mediaIds).then(many)
        : Promise.resolve([]),
      fetchItemSources(db, embeddedItems),
      // Crédito da foto de terceiros: nome do veículo (pequena tabela pública, só com reprodução).
      hasReproduction(embeddedMedia) ? fetchCreditSources(db) : Promise.resolve(null),
    ]);

  const links = [...embeddedLinks, ...fetchedLinks];
  const media: MediaRow[] = [...embeddedMedia, ...fetchedMedia];
  const seenItems = new Set(embeddedItems);
  const missingItems = [...new Set(fetchedLinks.map((l) => l.item_id))].filter(
    (id) => !seenItems.has(id),
  );
  const [moreItems, creditSources] = await Promise.all([
    fetchItemSources(db, missingItems),
    firstCredits ?? (hasReproduction(media) ? fetchCreditSources(db) : Promise.resolve([])),
  ]);
  const itemSource = new Map(
    [...firstItems, ...moreItems].map((i) => [i.id ?? "", i.source_slug ?? ""]),
  );

  const sourceSlugs = new Map<string, Set<string>>();
  for (const l of links) {
    const slug = itemSource.get(l.item_id);
    if (!slug) continue;
    const set = sourceSlugs.get(l.article_id) ?? new Set<string>();
    set.add(slug);
    sourceSlugs.set(l.article_id, set);
  }

  const images = new Map<string, ArticleImage>();
  const inlineImages = new Map<string, ArticleInlineImage>();
  for (const m of media) {
    const asset = m.media_assets;
    // Ativo removido a pedido (bloqueado) some só ele: a outra imagem da matéria continua.
    if (!asset || asset.status !== "approved") continue;
    const inline = m.role === "inline";
    if (inline ? inlineImages.has(m.article_id) : images.has(m.article_id)) continue;
    if (inline && (m.position ?? 0) < 1) continue;
    const kind = MEDIA_KIND[asset.kind];
    const image: ArticleImage = {
      // Bucket privado (ADR-009): a rota própria valida aprovação e flag e assina a URL.
      src: mediaHref(asset.id),
      // Texto alternativo escrito na redação (o checklist exige); sem ele, imagem decorativa.
      alt: m.alt?.trim() ?? "",
      kind,
      credit:
        kind === "reproduction"
          ? (creditName(
              {
                sourceName: asset.source_name,
                sourceId: asset.source_id,
                originUrl: asset.origin_url,
                pageUrl: asset.page_url,
              },
              creditSources,
            ) ??
            asset.credit ??
            undefined)
          : kind === "licensed"
            ? asset.license
            : (asset.credit ?? undefined),
      author:
        kind === "reproduction" &&
        asset.credit &&
        asset.credit !== hostOf(asset.origin_url) &&
        asset.credit !== hostOf(asset.page_url) &&
        asset.credit !== asset.source_name
          ? asset.credit
          : undefined,
      // "Ver original" vai para a PÁGINA da matéria da fonte, nunca para o arquivo da imagem.
      originUrl: kind === "reproduction" ? (asset.page_url ?? undefined) : undefined,
    };
    if (inline) inlineImages.set(m.article_id, { ...image, position: m.position ?? 0 });
    else images.set(m.article_id, image);
  }

  return {
    sections: new Map(sectionRows.map((s) => [s.slug, { slug: s.slug, name: s.name }])),
    names: new Map(
      bylines
        .filter((b): b is { id: string; display_name: string } => !!b.id && !!b.display_name)
        .map((b) => [b.id, b.display_name]),
    ),
    sourceSlugs,
    images,
    inlineImages,
  };
}

function toSummary(row: ArticleRow, h: Hydration): ArticleSummary {
  const blocks = parseBody(row.body);
  const sourceCount = h.sourceSlugs.get(row.id)?.size ?? 0;
  const reviewer = row.ai_summary_reviewed_by ? h.names.get(row.ai_summary_reviewed_by) : undefined;
  const image = h.images.get(row.id);
  const kind = row.kind === "normalized" ? "normalized" : "original";
  const publishMode = row.publish_mode ?? null;
  return {
    id: row.id,
    slug: row.slug,
    href: articleHref(row.slug),
    kind,
    title: row.title,
    dek: row.dek,
    section: h.sections.get(row.section_slug) ?? {
      slug: row.section_slug,
      name: row.section_slug,
    },
    status: row.status === "updated" ? "updated" : "published",
    publishMode,
    publishedAt: row.published_at ?? row.updated_at,
    updatedAt: row.updated_at,
    labels: labelsFor({
      kind,
      sourceCount,
      hasAiSummary: !!row.ai_summary?.length,
      publishMode,
      reviewerName: reviewer,
      image: image
        ? {
            kind: image.kind,
            credit: image.kind === "original" ? image.credit : undefined,
            sourceName: image.kind === "original" ? undefined : image.credit,
          }
        : undefined,
      sponsored: row.sponsored,
    }),
    confidence: { level: row.confidence, score: Number(row.confidence_score) },
    sourceCount,
    readMinutes: readMinutes(blocks, row.dek),
    aiSummary: row.ai_summary?.length ? row.ai_summary : null,
    byline: (row.author_id && h.names.get(row.author_id)) || BYLINE.newsroom,
    reviewer,
    image,
    inlineImage: h.inlineImages.get(row.id),
    topicId: row.topic_id,
    urgent: row.urgent,
    sponsored: row.sponsored,
    newsScope: asScope(row.news_scope) ?? undefined,
    nationalCommotion: row.national_commotion,
    reviewBanner: row.review_banner === true ? true : undefined,
  };
}

/** Converte linhas de `articles` em cards com rótulos, fontes, assinatura e imagem aprovada. */
export async function summarize(db: DbClient, rows: SummarizableRow[]): Promise<ArticleSummary[]> {
  if (rows.length === 0) return [];
  const h = await loadHydration(db, rows);
  return rows.map((r) => toSummary(r, h));
}

/** Matérias públicas mais recentes (base da home e das listas), opcionalmente de um destino. */
export async function fetchRecentArticles(
  db: DbClient,
  limit: number,
  destination?: PublicDestination,
): Promise<SummarizableRow[]> {
  let q = db
    .from("articles")
    .select(ARTICLE_COLUMNS_HYDRATED)
    .in("status", [...PUBLIC_STATUSES]);
  if (destination) q = q.contains("publish_destinations", [destination]);
  return q.order("published_at", { ascending: false }).limit(limit).then(many);
}

const ROLE_ORDER = { primary: 0, secondary: 1, context: 2 } as const;

/** ISR da matéria: 300 s + tag `article:<id>` (architecture §8). */
export const ARTICLE_REVALIDATE = 300;

export function articleTag(id: string): string {
  return `article:${id}`;
}

type VersionRow = {
  number: number | null;
  change_kind: string | null;
  public_note: string | null;
  created_at: string | null;
};

function toNotes(rows: VersionRow[]): ArticleNote[] {
  return rows.flatMap((v) =>
    (v.change_kind === "update" || v.change_kind === "correction") && v.public_note && v.created_at
      ? [{ kind: v.change_kind, note: v.public_note, at: v.created_at, version: v.number ?? 0 }]
      : [],
  );
}

async function fetchRelated(db: DbClient, row: ArticleRow): Promise<ArticleSummary[]> {
  const [sameTopic, sameSection] = await Promise.all([
    row.topic_id
      ? db
          .from("articles")
          .select(ARTICLE_COLUMNS_HYDRATED)
          .eq("topic_id", row.topic_id)
          .neq("id", row.id)
          .in("status", [...PUBLIC_STATUSES])
          .order("published_at", { ascending: false })
          .limit(3)
          .then(many)
      : Promise.resolve([]),
    db
      .from("articles")
      .select(ARTICLE_COLUMNS_HYDRATED)
      .eq("section_slug", row.section_slug)
      .neq("id", row.id)
      .in("status", [...PUBLIC_STATUSES])
      .eq("sponsored", false)
      .order("published_at", { ascending: false })
      .limit(4)
      .then(many),
  ]);
  const seen = new Set(sameTopic.map((r) => r.id));
  const extra = sameSection.filter((r) => !seen.has(r.id)).slice(0, 2);
  return summarize(db, [...sameTopic, ...extra]);
}

/** Resolve slug → id (estável; em cache pela tag do slug). */
async function idForSlug(db: DbClient, slug: string): Promise<string | null> {
  const row = await db
    .from("articles")
    .select("id")
    .eq("slug", slug)
    .in("status", [...PUBLIC_STATUSES])
    .maybeSingle()
    .then(one);
  return row?.id ?? null;
}

/** Resultado da checagem de "removida" já feita pelo proxy na mesma requisição (`proxyGoneHint`). */
export interface ArticleGoneHint {
  reason: string | null;
}

/**
 * Matéria pública pelo slug. Arquivada ou despublicada devolve `{ gone, reason }` (410);
 * inexistente devolve `null` (404). Com `cache`, as leituras entram no cache de dados do Next
 * com a tag `article:<id>` e revalidação de 300 s. Com `gone` (a checagem do proxy), a matéria
 * fora do ar não repete `public_article_gone`; o motivo só é usado quando a linha pública não
 * existe. Memorizada por requisição (React `cache()`, UX-W5-T2): `generateMetadata` e a página
 * leem uma vez só.
 */
export function getArticleBySlug(
  slug: string,
  opts: { cache?: boolean; gone?: ArticleGoneHint | null } = {},
): Promise<Result<ArticleLookup, QueryError>> {
  // Argumentos primitivos: o `cache()` do React compara objetos por identidade.
  const hint = opts.gone ? (opts.gone.reason === null ? "live" : "gone") : "none";
  return loadArticleBySlug(slug, !!opts.cache, hint, opts.gone?.reason ?? null);
}

const loadArticleBySlug = cache(
  (
    slug: string,
    useCache: boolean,
    hint: "none" | "live" | "gone",
    hintReason: string | null,
  ): Promise<Result<ArticleLookup, QueryError>> =>
    readArticleBySlug(slug, useCache, hint === "none" ? null : { reason: hintReason }),
);

async function readArticleBySlug(
  slug: string,
  useCache: boolean,
  hint: ArticleGoneHint | null,
): Promise<Result<ArticleLookup, QueryError>> {
  const opts = { cache: useCache };
  const slugCache = opts.cache
    ? { tags: [`article-slug:${slug}`], revalidate: ARTICLE_REVALIDATE }
    : undefined;
  return readPublic(async (first, cached) => {
    const id = await idForSlug(first, slug);
    const db =
      id && opts.cache ? cached({ tags: [articleTag(id)], revalidate: ARTICLE_REVALIDATE }) : first;
    const row = id
      ? await db
          .from("articles")
          .select(ARTICLE_COLUMNS_HYDRATED)
          .eq("id", id)
          .in("status", [...PUBLIC_STATUSES])
          .maybeSingle()
          .then(one)
      : null;

    if (!row) {
      const reason = hint
        ? hint.reason
        : await db.rpc("public_article_gone", { p_slug: slug }).then(one);
      return reason ? { gone: true as const, reason } : null;
    }

    const [summary] = await summarize(db, [row]);
    if (!summary) return null;
    const [links, versionRows, topic, related] = await Promise.all([
      db
        .from("article_sources")
        .select("item_id, role, confirmed")
        .eq("article_id", row.id)
        .then(many),
      db
        .from("public_article_versions")
        .select("number, change_kind, public_note, created_at")
        .eq("article_id", row.id)
        .order("number", { ascending: false })
        .then(many),
      row.topic_id
        ? db
            .from("topics")
            .select("slug, title, state")
            .eq("id", row.topic_id)
            .maybeSingle()
            .then(one)
        : Promise.resolve(null),
      fetchRelated(db, row),
    ]);

    const items = links.length
      ? await db
          .from("public_aggregated")
          .select("id, source_name, source_slug, canonical_url, original_title, published_at")
          .in(
            "id",
            links.map((l) => l.item_id),
          )
          .then(many)
      : [];
    const byId = new Map(items.map((i) => [i.id ?? "", i]));
    const sources: ArticleSource[] = links
      .flatMap((l) => {
        const item = byId.get(l.item_id);
        if (!item?.canonical_url) return [];
        const role = l.role === "primary" || l.role === "secondary" ? l.role : "context";
        return [
          {
            name: item.source_name ?? "",
            sourceSlug: item.source_slug ?? "",
            role,
            confirmed: l.confirmed,
            url: item.canonical_url,
            title: item.original_title ?? "",
            publishedAt: item.published_at,
          } satisfies ArticleSource,
        ];
      })
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);

    const view: ArticleView = {
      ...summary,
      body: parseBody(row.body),
      sources,
      versions: versionRows.length,
      notes: toNotes(versionRows),
      agentId: row.agent_id,
      authorIsPerson: summary.byline !== BYLINE.newsroom,
      topic: topic ? { slug: topic.slug, title: topic.title, state: topic.state } : null,
      related,
      seoTitle: row.seo_title?.trim() || null,
      seoDescription: row.seo_description?.trim() || null,
    };
    return view;
  }, slugCache);
}

/** Último `updated_at` público da matéria (aviso "foi atualizada", polling de 120 s). Sem cache. */
export async function getArticleUpdatedAt(
  slug: string,
): Promise<Result<string | null, QueryError>> {
  return readPublic(async (db) => {
    const row = await db
      .from("articles")
      .select("updated_at")
      .eq("slug", slug)
      .in("status", [...PUBLIC_STATUSES])
      .maybeSingle()
      .then(one);
    return row?.updated_at ?? null;
  });
}

/** Histórico público de versões (P04): só versões publicadas, mais recente primeiro. */
export async function getArticleHistory(
  slug: string,
): Promise<Result<ArticleHistory | null, QueryError>> {
  return readPublic(async (first, cached) => {
    const id = await idForSlug(first, slug);
    if (!id) return null;
    const db = cached({ tags: [articleTag(id)], revalidate: ARTICLE_REVALIDATE });
    const [row, sections, versions] = await Promise.all([
      db.from("articles").select("slug, title, section_slug").eq("id", id).maybeSingle().then(one),
      db.from("sections").select("slug, name").then(many),
      db
        .from("public_article_versions")
        .select("number, change_kind, public_note, created_at, title, dek, body")
        .eq("article_id", id)
        .order("number", { ascending: false })
        .then(many),
    ]);
    if (!row) return null;
    const section = sections.find((s) => s.slug === row.section_slug);
    return {
      slug: row.slug,
      href: articleHref(row.slug),
      title: row.title,
      section: section ?? { slug: row.section_slug, name: row.section_slug },
      versions: versions.map((v) => ({
        number: v.number ?? 0,
        kind: v.change_kind === "update" || v.change_kind === "correction" ? v.change_kind : "edit",
        note: v.public_note,
        at: v.created_at ?? "",
        title: v.title ?? "",
        dek: v.dek ?? "",
        body: parseBody(v.body),
      })),
    };
  });
}

/**
 * O conteúdo de uma denúncia (`article|event|topic|aggregated:<uuid>`) existe e está no ar? Lido
 * com a chave anônima: público é o que o portal mostra (C3-03).
 */
export async function publicContentExists(ref: string): Promise<Result<boolean, QueryError>> {
  const m = /^(article|event|topic|aggregated):([0-9a-f-]{36})$/.exec(ref);
  if (!m) return { ok: true, value: false };
  const [, kind, id] = m as unknown as [string, string, string];
  return readPublic(async (db) => {
    const q =
      kind === "article"
        ? db
            .from("articles")
            .select("id")
            .eq("id", id)
            .in("status", [...PUBLIC_STATUSES])
        : kind === "event"
          ? db.from("event_listings").select("id").eq("id", id)
          : kind === "topic"
            ? db.from("topics").select("id").eq("id", id)
            : db.from("public_aggregated").select("id").eq("id", id);
    return (await q.maybeSingle().then(one)) !== null;
  });
}

/** id da matéria pública pelo slug (direito de resposta); null se não existe ou saiu do ar. */
export async function findPublicArticleId(
  slug: string,
): Promise<Result<string | null, QueryError>> {
  return readPublic((db) => idForSlug(db, slug));
}
