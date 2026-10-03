import "server-only";
import { creditName, type CreditSource } from "@/lib/media/credit";
import { mediaHref } from "@/lib/media/serve";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { labelsFor, type ImageKind } from "@/lib/labels";
import type { Result } from "@/lib/result";
import { BYLINE } from "@/content/pt-BR/portal-card";
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
>;

export const ARTICLE_COLUMNS =
  "id, slug, kind, topic_id, section_slug, title, dek, body, ai_summary, ai_summary_reviewed_by, status, publish_mode, confidence, confidence_score, author_id, agent_id, urgent, sponsored, published_at, updated_at, seo_title, seo_description";

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

async function loadHydration(db: DbClient, rows: ArticleRow[]): Promise<Hydration> {
  const ids = rows.map((r) => r.id);
  const people = [
    ...new Set(
      rows.flatMap((r) => [r.author_id, r.ai_summary_reviewed_by]).filter((v): v is string => !!v),
    ),
  ];

  const [sectionRows, links, bylines, media] = await Promise.all([
    db.from("sections").select("slug, name").then(many),
    ids.length
      ? db.from("article_sources").select("article_id, item_id").in("article_id", ids).then(many)
      : Promise.resolve([]),
    people.length
      ? db.from("public_bylines").select("id, display_name").in("id", people).then(many)
      : Promise.resolve([]),
    ids.length
      ? db
          .from("article_media")
          .select(
            "article_id, alt, role, position, media_assets(id, kind, storage_path, origin_url, page_url, source_id, source_name, license, credit, status)",
          )
          .in("article_id", ids)
          .then(many)
      : Promise.resolve([]),
  ]);

  const itemIds = [...new Set(links.map((l) => l.item_id))];
  const items = itemIds.length
    ? await db.from("public_aggregated").select("id, source_slug").in("id", itemIds).then(many)
    : [];
  const itemSource = new Map(items.map((i) => [i.id ?? "", i.source_slug ?? ""]));

  const sourceSlugs = new Map<string, Set<string>>();
  for (const l of links) {
    const slug = itemSource.get(l.item_id);
    if (!slug) continue;
    const set = sourceSlugs.get(l.article_id) ?? new Set<string>();
    set.add(slug);
    sourceSlugs.set(l.article_id, set);
  }

  // Crédito da foto de terceiros: nome do veículo (pequena tabela pública, só quando há reprodução).
  const reproductions = media.some((m) => m.media_assets?.kind === "reproduction");
  const creditSources: CreditSource[] = reproductions
    ? await db
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
        )
    : [];

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
  };
}

/** Converte linhas de `articles` em cards com rótulos, fontes, assinatura e imagem aprovada. */
export async function summarize(db: DbClient, rows: ArticleRow[]): Promise<ArticleSummary[]> {
  if (rows.length === 0) return [];
  const h = await loadHydration(db, rows);
  return rows.map((r) => toSummary(r, h));
}

/** Matérias públicas mais recentes (base da home e das listas), opcionalmente de um destino. */
export async function fetchRecentArticles(
  db: DbClient,
  limit: number,
  destination?: PublicDestination,
): Promise<ArticleRow[]> {
  let q = db
    .from("articles")
    .select(ARTICLE_COLUMNS)
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
          .select(ARTICLE_COLUMNS)
          .eq("topic_id", row.topic_id)
          .neq("id", row.id)
          .in("status", [...PUBLIC_STATUSES])
          .order("published_at", { ascending: false })
          .limit(3)
          .then(many)
      : Promise.resolve([]),
    db
      .from("articles")
      .select(ARTICLE_COLUMNS)
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

/**
 * Matéria pública pelo slug. Arquivada ou despublicada devolve `{ gone, reason }` (410);
 * inexistente devolve `null` (404). Com `cache`, as leituras entram no cache de dados do Next
 * com a tag `article:<id>` e revalidação de 300 s.
 */
export async function getArticleBySlug(
  slug: string,
  opts: { cache?: boolean } = {},
): Promise<Result<ArticleLookup, QueryError>> {
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
          .select(ARTICLE_COLUMNS)
          .eq("id", id)
          .in("status", [...PUBLIC_STATUSES])
          .maybeSingle()
          .then(one)
      : null;

    if (!row) {
      const reason = await db.rpc("public_article_gone", { p_slug: slug }).then(one);
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

/** id da matéria pública pelo slug (direito de resposta); null se não existe ou saiu do ar. */
export async function findPublicArticleId(
  slug: string,
): Promise<Result<string | null, QueryError>> {
  return readPublic((db) => idForSlug(db, slug));
}
