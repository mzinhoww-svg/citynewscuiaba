import "server-only";
import type { Database, Json } from "@/lib/db/types";
import { checklist, type Checklist } from "@/lib/studio/checklist";
import { studioContext } from "@/lib/studio/context";
import { loadDraftView } from "@/lib/studio/draft-view";
import type { FieldOrigins } from "@/lib/studio/save";

type Status = Database["public"]["Enums"]["article_status"];
type Confidence = Database["public"]["Enums"]["confidence_level"];

export interface StudioSource {
  itemId: string;
  role: "primary" | "secondary" | "context";
  confirmed: boolean;
  title: string;
  url: string;
  sourceName: string;
  reliability: string;
  publishedAt: string | null;
}

export interface StudioImage {
  mediaId: string;
  kind: Database["public"]["Enums"]["media_kind"];
  status: string;
  credit: string | null;
  license: string;
  licenseUntil: string | null;
  alt: string | null;
  sourceName: string | null;
  rationale: string;
  chosenBy: string;
}

export interface StudioSuggestion {
  id: string;
  field: "title" | "dek" | "seo_title" | "seo_description" | "body";
  value: string;
  rationale: string | null;
  agentId: string;
  promptVersion: number | null;
}

export interface StudioVersion {
  number: number;
  origin: "human" | "ai";
  authorName: string | null;
  changeKind: string;
  publicNote: string | null;
  createdAt: string;
}

export interface StudioDecision {
  step: string;
  agentId: string | null;
  promptVersion: number | null;
  rulesVersion: number | null;
  recommended: string | null;
  humanDecision: string | null;
  humanName: string | null;
  rationale: string | null;
  createdAt: string;
}

export interface StudioArticle {
  id: string;
  slug: string;
  kind: "original" | "normalized";
  status: Status;
  publishMode: "human" | "auto" | null;
  title: string;
  dek: string;
  body: Json;
  section: { slug: string; name: string };
  topic: { id: string; title: string } | null;
  tags: string[];
  neighborhoods: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  fieldOrigins: FieldOrigins;
  confidence: Confidence;
  confidenceScore: number;
  agentId: string | null;
  authorId: string | null;
  authorName: string | null;
  reviewReason: string | null;
  aiFallback: boolean;
  urgent: boolean;
  aiSummary: string[] | null;
  updatedAt: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  version: number;
  versions: StudioVersion[];
  sources: StudioSource[];
  images: StudioImage[];
  suggestions: StudioSuggestion[];
  decisions: StudioDecision[];
  /** As fontes divergem sobre um fato central (última verificação do assunto). */
  centralConflict: boolean;
  /** Primeira versão do pipeline (IA), para comparar com o texto atual (IA × humano). */
  aiVersion: { title: string; dek: string; body: Json } | null;
  checklist: Checklist;
}

const ROLE = (r: string): StudioSource["role"] =>
  r === "primary" ? "primary" : r === "secondary" ? "secondary" : "context";
const FIELDS = ["title", "dek", "seo_title", "seo_description", "body"] as const;
const isField = (f: string): f is StudioSuggestion["field"] =>
  (FIELDS as readonly string[]).includes(f);

function record(v: Json | undefined): Record<string, Json | undefined> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? v : {};
}

/** Matéria completa para o editor e a revisão (E03/E04), com a sessão de quem abre (RLS). */
export async function getStudioArticle(id: string): Promise<StudioArticle | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const ctx = await studioContext();
  const { db } = ctx;
  const { data: a, error } = await db
    .from("articles")
    .select(
      "id, slug, kind, status, publish_mode, title, dek, body, section_slug, topic_id, tags, neighborhoods, seo_title, seo_description, field_origins, confidence, confidence_score, agent_id, author_id, review_reason, ai_fallback, urgent, ai_summary, updated_at, published_at, scheduled_for, sections(name), topics(id, title)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`matéria: ${error.message}`);
  if (!a) return null;

  const [versions, sources, media, suggestions, decisions, view] = await Promise.all([
    db
      .from("article_versions")
      .select("number, origin, author_id, change_kind, public_note, created_at, snapshot")
      .eq("article_id", id)
      .order("number", { ascending: false }),
    db
      .from("article_sources")
      .select(
        "item_id, role, confirmed, collected_items(original_title, canonical_url, published_at, sources(name, display_name, reliability))",
      )
      .eq("article_id", id),
    db
      .from("article_media")
      .select(
        "media_id, rationale, chosen_by, alt, media_assets(kind, status, credit, license, license_until, source_name)",
      )
      .eq("article_id", id),
    db
      .from("article_suggestions")
      .select("id, field, value, rationale, agent_id, prompt_version")
      .eq("article_id", id)
      .eq("status", "open")
      .order("created_at"),
    db
      .from("decisions")
      .select(
        "step, agent_id, prompt_version, rules_version, recommended, human_decision, human_id, rationale, created_at, object_ref, output",
      )
      .in("object_ref", [`article:${id}`, ...(a.topic_id ? [`topic:${a.topic_id}`] : [])])
      .order("created_at", { ascending: false })
      .limit(40),
    loadDraftView(ctx, id),
  ]);

  const people = new Set<string>();
  for (const v of versions.data ?? []) if (v.author_id) people.add(v.author_id);
  for (const d of decisions.data ?? []) if (d.human_id) people.add(d.human_id);
  if (a.author_id) people.add(a.author_id);
  const { data: profiles } = people.size
    ? await db
        .from("profiles")
        .select("id, display_name")
        .in("id", [...people])
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const versionRows = versions.data ?? [];
  const firstAi = [...versionRows].reverse().find((v) => v.origin === "ai");
  const snap = record(firstAi?.snapshot);
  const topicVerify = (decisions.data ?? []).find(
    (d) => d.object_ref === `topic:${a.topic_id}` && d.step === "verify",
  );

  return {
    id: a.id,
    slug: a.slug,
    kind: a.kind === "original" ? "original" : "normalized",
    status: a.status,
    publishMode: a.publish_mode,
    title: a.title,
    dek: a.dek,
    body: a.body,
    section: { slug: a.section_slug, name: a.sections?.name ?? a.section_slug },
    topic: a.topics ? { id: a.topics.id, title: a.topics.title } : null,
    tags: a.tags,
    neighborhoods: a.neighborhoods,
    seoTitle: a.seo_title,
    seoDescription: a.seo_description,
    fieldOrigins: record(a.field_origins) as FieldOrigins,
    confidence: a.confidence,
    confidenceScore: Number(a.confidence_score),
    agentId: a.agent_id,
    authorId: a.author_id,
    authorName: a.author_id ? (nameOf.get(a.author_id) ?? null) : null,
    reviewReason: a.review_reason,
    aiFallback: a.ai_fallback,
    urgent: a.urgent,
    aiSummary: a.ai_summary,
    updatedAt: a.updated_at,
    publishedAt: a.published_at,
    scheduledFor: a.scheduled_for,
    version: versionRows[0]?.number ?? 0,
    versions: versionRows.map((v) => ({
      number: v.number,
      origin: v.origin === "ai" ? "ai" : "human",
      authorName: v.author_id ? (nameOf.get(v.author_id) ?? null) : null,
      changeKind: v.change_kind,
      publicNote: v.public_note,
      createdAt: v.created_at,
    })),
    sources: (sources.data ?? []).map((s) => ({
      itemId: s.item_id,
      role: ROLE(s.role),
      confirmed: s.confirmed,
      title: s.collected_items?.original_title ?? "",
      url: s.collected_items?.canonical_url ?? "",
      sourceName:
        s.collected_items?.sources?.display_name ?? s.collected_items?.sources?.name ?? "",
      reliability: s.collected_items?.sources?.reliability ?? "standard",
      publishedAt: s.collected_items?.published_at ?? null,
    })),
    images: (media.data ?? []).flatMap((m) =>
      m.media_assets
        ? [
            {
              mediaId: m.media_id,
              kind: m.media_assets.kind,
              status: m.media_assets.status,
              credit: m.media_assets.credit,
              license: m.media_assets.license,
              licenseUntil: m.media_assets.license_until,
              alt: m.alt,
              sourceName: m.media_assets.source_name,
              rationale: m.rationale,
              chosenBy: m.chosen_by,
            },
          ]
        : [],
    ),
    suggestions: (suggestions.data ?? []).flatMap((s) =>
      isField(s.field)
        ? [
            {
              id: s.id,
              field: s.field,
              value: s.value,
              rationale: s.rationale,
              agentId: s.agent_id,
              promptVersion: s.prompt_version,
            },
          ]
        : [],
    ),
    decisions: (decisions.data ?? [])
      .filter((d) => d.object_ref === `article:${id}`)
      .map((d) => ({
        step: d.step,
        agentId: d.agent_id,
        promptVersion: d.prompt_version,
        rulesVersion: d.rules_version,
        recommended: d.recommended,
        humanDecision: d.human_decision,
        humanName: d.human_id ? (nameOf.get(d.human_id) ?? null) : null,
        rationale: d.rationale,
        createdAt: d.created_at,
      })),
    centralConflict: record(topicVerify?.output).centralConflict === true,
    aiVersion: firstAi
      ? {
          title: typeof snap.title === "string" ? snap.title : "",
          dek: typeof snap.dek === "string" ? snap.dek : "",
          body: snap.body ?? null,
        }
      : null,
    checklist: checklist(
      view ?? {
        title: a.title,
        dek: a.dek,
        sectionSlug: a.section_slug,
        tags: a.tags,
        neighborhoods: a.neighborhoods,
        requirePrimary: true,
        sources: [],
        images: [],
        seoTitle: a.seo_title,
        seoDescription: a.seo_description,
        openSuggestions: 0,
      },
    ),
  };
}

/** Itens coletados que podem virar fonte: do mesmo assunto e, depois, da mesma editoria. */
export async function sourceCandidates(
  article: Pick<StudioArticle, "id" | "topic" | "section" | "sources">,
): Promise<{ value: string; label: string }[]> {
  const ctx = await studioContext();
  const taken = new Set(article.sources.map((s) => s.itemId));
  const cols = "id, original_title, sources(name, display_name)";
  const [byTopic, bySection] = await Promise.all([
    article.topic
      ? ctx.db
          .from("collected_items")
          .select(cols)
          .eq("topic_id", article.topic.id)
          .is("duplicate_of", null)
          .limit(30)
      : Promise.resolve({ data: [] }),
    ctx.db
      .from("collected_items")
      .select(cols)
      .eq("section_slug", article.section.slug)
      .is("duplicate_of", null)
      .order("published_at", { ascending: false })
      .limit(30),
  ]);
  const seen = new Set<string>();
  return [...(byTopic.data ?? []), ...(bySection.data ?? [])].flatMap((c) => {
    if (taken.has(c.id) || seen.has(c.id)) return [];
    seen.add(c.id);
    const src = c.sources?.display_name ?? c.sources?.name ?? "";
    return [{ value: c.id, label: `${src} · ${c.original_title}` }];
  });
}

/** Assuntos para o seletor do editor (mais recentes primeiro). */
export async function topicOptions(): Promise<{ value: string; label: string }[]> {
  const ctx = await studioContext();
  const { data } = await ctx.db
    .from("topics")
    .select("id, title")
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((t) => ({ value: t.id, label: t.title }));
}

export interface StudioVersionFull extends StudioVersion {
  snapshot: { title: string; dek: string; body: Json };
}

/** Versões da matéria com o conteúdo de cada uma (E05), mais recentes primeiro. */
export async function listVersions(
  id: string,
): Promise<{ title: string; versions: StudioVersionFull[] } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const ctx = await studioContext();
  const [{ data: a }, { data: rows, error }] = await Promise.all([
    ctx.db.from("articles").select("title").eq("id", id).maybeSingle(),
    ctx.db
      .from("article_versions")
      .select("number, origin, author_id, change_kind, public_note, created_at, snapshot")
      .eq("article_id", id)
      .order("number", { ascending: false }),
  ]);
  if (error) throw new Error(`versões: ${error.message}`);
  if (!a) return null;
  const people = [...new Set((rows ?? []).flatMap((r) => (r.author_id ? [r.author_id] : [])))];
  const { data: profiles } = people.length
    ? await ctx.db.from("profiles").select("id, display_name").in("id", people)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  return {
    title: a.title,
    versions: (rows ?? []).map((v) => {
      const s = record(v.snapshot);
      return {
        number: v.number,
        origin: v.origin === "ai" ? "ai" : "human",
        authorName: v.author_id ? (nameOf.get(v.author_id) ?? null) : null,
        changeKind: v.change_kind,
        publicNote: v.public_note,
        createdAt: v.created_at,
        snapshot: {
          title: typeof s.title === "string" ? s.title : "",
          dek: typeof s.dek === "string" ? s.dek : "",
          body: s.body ?? null,
        },
      };
    }),
  };
}
