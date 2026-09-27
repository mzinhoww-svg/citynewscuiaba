import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { labelsFor, type ImageKind } from "@/lib/labels";
import type { Result } from "@/lib/result";
import { BYLINE } from "@/content/pt-BR/portal";
import { many, one, readPublic } from "./run";
import type {
  ArticleBlock,
  ArticleImage,
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
>;

export const ARTICLE_COLUMNS =
  "id, slug, kind, topic_id, section_slug, title, dek, body, ai_summary, ai_summary_reviewed_by, status, publish_mode, confidence, confidence_score, author_id, agent_id, urgent, sponsored, published_at, updated_at";

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
      blocks.push({ type: "paragraph", text });
    }
  }
  return blocks;
}

function readMinutes(blocks: ArticleBlock[], dek: string): number {
  const words = [dek, ...blocks.map((b) => b.text)].join(" ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

function mediaSrc(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/media/${path.replace(/^\/+/, "")}`;
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
  images: Map<string, ArticleImage>;
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
            "article_id, media_assets(kind, storage_path, origin_url, license, credit, status)",
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

  const images = new Map<string, ArticleImage>();
  for (const m of media) {
    const asset = m.media_assets;
    if (!asset || asset.status !== "approved" || images.has(m.article_id)) continue;
    const kind = MEDIA_KIND[asset.kind];
    images.set(m.article_id, {
      src: mediaSrc(asset.storage_path),
      alt: "",
      kind,
      credit:
        kind === "reproduction"
          ? (hostOf(asset.origin_url) ?? asset.credit ?? undefined)
          : kind === "licensed"
            ? asset.license
            : (asset.credit ?? undefined),
    });
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

/** Matérias públicas mais recentes (base da home e das listas). */
export async function fetchRecentArticles(db: DbClient, limit: number): Promise<ArticleRow[]> {
  return db
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .in("status", [...PUBLIC_STATUSES])
    .order("published_at", { ascending: false })
    .limit(limit)
    .then(many);
}

const ROLE_ORDER = { primary: 0, secondary: 1, context: 2 } as const;

/**
 * Matéria pública pelo slug. Arquivada ou despublicada devolve `{ gone, reason }` (410);
 * inexistente devolve `null` (404).
 */
export async function getArticleBySlug(slug: string): Promise<Result<ArticleLookup, QueryError>> {
  return readPublic(async (db) => {
    const row = await db
      .from("articles")
      .select(ARTICLE_COLUMNS)
      .eq("slug", slug)
      .in("status", [...PUBLIC_STATUSES])
      .maybeSingle()
      .then(one);

    if (!row) {
      const reason = await db.rpc("public_article_gone", { p_slug: slug }).then(one);
      return reason ? { gone: true as const, reason } : null;
    }

    const [summary] = await summarize(db, [row]);
    if (!summary) return null;
    const [links, versions, topic] = await Promise.all([
      db
        .from("article_sources")
        .select("item_id, role, confirmed")
        .eq("article_id", row.id)
        .then(many),
      db
        .from("article_versions")
        .select("id", { count: "exact", head: true })
        .eq("article_id", row.id)
        .then((r) => {
          if (r.error) throw new Error(r.error.message);
          return r.count ?? 0;
        }),
      row.topic_id
        ? db
            .from("topics")
            .select("slug, title, state")
            .eq("id", row.topic_id)
            .maybeSingle()
            .then(one)
        : Promise.resolve(null),
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
      versions,
      agentId: row.agent_id,
      topic: topic ? { slug: topic.slug, title: topic.title, state: topic.state } : null,
    };
    return view;
  });
}
