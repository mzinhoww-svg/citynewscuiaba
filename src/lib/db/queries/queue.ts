import "server-only";
import type { Database } from "@/lib/db/types";
import { startOfDay } from "@/lib/format/date";
import { studioContext } from "@/lib/studio/context";
import { afterKey, cursorOf, decodeCursor, throughKey, type KeySpec, type Page } from "./cursor";

type Status = Database["public"]["Enums"]["article_status"];
type Confidence = Database["public"]["Enums"]["confidence_level"];

export const QUEUE_TABS = ["all", "exceptions", "auto24h", "mine", "sensitive"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];
export const QUEUE_ORIGINS = ["original", "pipeline", "auto"] as const;
export type QueueOrigin = (typeof QUEUE_ORIGINS)[number];

export interface QueueFilter {
  tab: QueueTab;
  section?: string;
  status?: Status;
  confidence?: Confidence;
  /** Id de pessoa, "me" (quem consulta) ou "none" (sem responsável). */
  assignee?: string;
  origin?: QueueOrigin;
  /** Prazo: vencido ou vencendo hoje (até o fim do dia). */
  due?: "overdue" | "today";
  /** Só matérias em revisão (`in_review`), para "selecionar todas" e a publicação forçada. */
  reviewOnly?: boolean;
}

export interface QueueRow {
  id: string;
  slug: string;
  title: string;
  section: { slug: string; name: string };
  kind: "original" | "normalized";
  status: Status;
  publishMode: "human" | "auto" | null;
  confidence: Confidence;
  confidenceScore: number;
  /** Rascunho do pipeline (agente) ou de pessoa. */
  fromPipeline: boolean;
  author: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  dueAt: string | null;
  updatedAt: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  reviewReason: string | null;
  aiFallback: boolean;
  sensitive: boolean;
  urgent: boolean;
  /** Rota que as regras recomendaram (publish, publish_notify, review, hold). */
  recommended: string | null;
  recommendedRationale: string | null;
}

const OPEN: Status[] = ["draft", "in_review", "changes_requested", "approved", "scheduled"];
const PUBLIC: Status[] = ["published", "updated"];
const DAY_MS = 24 * 60 * 60 * 1000;

type Row = Database["public"]["Views"]["studio_queue"]["Row"];

function toRow(r: Row): QueueRow | null {
  if (!r.id || !r.slug || !r.title || !r.section_slug || !r.status || !r.kind) return null;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    section: { slug: r.section_slug, name: r.section_name ?? r.section_slug },
    kind: r.kind === "original" ? "original" : "normalized",
    status: r.status,
    publishMode: r.publish_mode,
    confidence: r.confidence ?? "baixa",
    confidenceScore: Number(r.confidence_score ?? 0),
    fromPipeline: r.agent_id !== null,
    author: r.author_id ? { id: r.author_id, name: r.author_name ?? "" } : null,
    assignee: r.assignee_id ? { id: r.assignee_id, name: r.assignee_name ?? "" } : null,
    dueAt: r.due_at,
    updatedAt: r.updated_at ?? new Date(0).toISOString(),
    publishedAt: r.published_at,
    scheduledFor: r.scheduled_for,
    reviewReason: r.review_reason,
    aiFallback: r.ai_fallback ?? false,
    sensitive: r.sensitive ?? false,
    urgent: r.urgent ?? false,
    recommended: r.recommended,
    recommendedRationale: r.recommended_rationale,
  };
}

/** Fim do dia de hoje em Cuiabá. */
function endOfToday(now: Date): Date {
  return new Date(startOfDay(now).getTime() + DAY_MS - 1);
}

/** Tamanho da página da fila e teto de linhas por consulta. */
export const QUEUE_PAGE = 100;
const QUEUE_CAP = 200;
/** Teto de linhas acumuladas por "Carregar mais" (até o cursor, numa consulta). */
export const QUEUE_THROUGH_MAX = 1000;

/** Ordem estável da fila: prazo (sem prazo por último), mais recente, id. */
const QUEUE_KEYS: KeySpec[] = [
  { col: "due_at", type: "ts", asc: true, nullable: true },
  { col: "updated_at", type: "ts", asc: false },
  { col: "id", type: "uuid", asc: true },
];
/** Aba de automáticas: publicação mais recente primeiro, id. */
const AUTO_KEYS: KeySpec[] = [
  { col: "published_at", type: "ts", asc: false },
  { col: "id", type: "uuid", asc: true },
];
const keysFor = (filter: QueueFilter) => (filter.tab === "auto24h" ? AUTO_KEYS : QUEUE_KEYS);

export interface QueuePageOptions {
  /** Linhas por página (padrão 100, teto 200). */
  limit?: number;
  /** Cursor opaco devolvido em `nextCursor`; inválido = volta ao começo. */
  cursor?: string;
}

/**
 * Fila do Estúdio (E01/E02) com a sessão de quem consulta (RLS). Abas:
 * - `exceptions`: rascunhos do pipeline que as regras mandaram para pessoa (motivo registrado);
 * - `auto24h`: publicadas automaticamente nas últimas 24 h;
 * - `mine`: atribuídas a mim ou de minha autoria ainda em andamento;
 * - `sensitive`: temas sensíveis (Segurança ou fonte marcada), fora do arquivo.
 *
 * Paginada por cursor: `total` é a contagem real com os filtros (nunca corta em silêncio) e
 * `nextCursor` traz a página seguinte, sem repetir nem pular itens empatados.
 */
export async function listQueue(
  filter: QueueFilter,
  { limit = QUEUE_PAGE, cursor }: QueuePageOptions = {},
): Promise<Page<QueueRow>> {
  const keys = keysFor(filter);
  const values = cursor ? decodeCursor(cursor, keys) : null;
  const size = Math.max(1, Math.min(limit, QUEUE_CAP));
  if (!values) return queryQueue(filter, { limit: size, page: true });
  // Com cursor, a contagem da consulta é só do restante: o total vem de uma contagem à parte.
  const [page, total] = await Promise.all([
    queryQueue(filter, { limit: size, page: true, where: afterKey(keys, values) }),
    queryQueue(filter, { limit: 1, countOnly: true }),
  ]);
  return { ...page, total: total.total };
}

/**
 * Linhas da fila do começo até o cursor, inclusive (o que "Carregar mais" já mostrou), até
 * `max`. Cursor inválido devolve lista vazia.
 */
export async function listQueueThrough(
  filter: QueueFilter,
  cursor: string,
  max: number = QUEUE_THROUGH_MAX,
): Promise<QueueRow[]> {
  const keys = keysFor(filter);
  const values = decodeCursor(cursor, keys);
  if (!values) return [];
  const r = await queryQueue(filter, {
    limit: Math.max(1, Math.min(max, QUEUE_THROUGH_MAX)),
    where: throughKey(keys, values),
  });
  return r.rows;
}

/** Teto de matérias da seleção "todas em revisão" (uma publicação forçada). */
export const REVIEW_SELECTION_MAX = 2000;

/**
 * Matérias em revisão (`in_review`) dentro das abas e filtros atuais, em todas as páginas:
 * `total` é a contagem exata; `rows` vem até `limit` (padrão: o teto da seleção).
 */
export async function listReviewable(
  filter: QueueFilter,
  limit: number = REVIEW_SELECTION_MAX,
): Promise<{ rows: QueueRow[]; total: number }> {
  const r = await queryQueue(
    { ...filter, reviewOnly: true },
    { limit: Math.max(1, Math.min(limit, REVIEW_SELECTION_MAX)) },
  );
  return { rows: r.rows, total: r.total };
}

interface QueryOptions {
  limit: number;
  /** Filtro keyset (conteúdo de `.or()`). */
  where?: string;
  /** Busca uma linha a mais para saber se há próxima página e devolve `nextCursor`. */
  page?: boolean;
  countOnly?: boolean;
}

async function queryQueue(filter: QueueFilter, opts: QueryOptions): Promise<Page<QueueRow>> {
  const ctx = await studioContext();
  const me = ctx.session?.userId;
  const now = ctx.now();
  let q = ctx.db
    .from("studio_queue")
    .select("*", { count: "exact", head: opts.countOnly === true });
  if (filter.reviewOnly) q = q.eq("status", "in_review");

  switch (filter.tab) {
    case "exceptions":
      q = q
        .in("status", ["draft", "in_review"])
        .not("agent_id", "is", null)
        .not("review_reason", "is", null);
      break;
    case "auto24h":
      q = q
        .eq("publish_mode", "auto")
        .in("status", PUBLIC)
        .gte("published_at", new Date(now.getTime() - DAY_MS).toISOString());
      break;
    case "mine":
      if (!me) return { rows: [], total: 0, nextCursor: null };
      q = q.or(`assignee_id.eq.${me},and(author_id.eq.${me},status.in.(${OPEN.join(",")}))`);
      break;
    case "sensitive":
      q = q.eq("sensitive", true).neq("status", "archived");
      break;
    default:
      q = q.neq("status", "archived");
  }

  if (filter.section) q = q.or(`section_slug.eq.${filter.section},category.eq.${filter.section}`);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.confidence) q = q.eq("confidence", filter.confidence);
  if (filter.assignee === "none") q = q.is("assignee_id", null);
  else if (filter.assignee === "me" && me) q = q.eq("assignee_id", me);
  else if (filter.assignee && /^[0-9a-f-]{36}$/.test(filter.assignee))
    q = q.eq("assignee_id", filter.assignee);
  if (filter.origin === "original") q = q.is("agent_id", null);
  if (filter.origin === "pipeline") q = q.not("agent_id", "is", null);
  if (filter.origin === "auto") q = q.eq("publish_mode", "auto");
  if (filter.due === "overdue") q = q.lt("due_at", now.toISOString()).in("status", OPEN);
  if (filter.due === "today") q = q.lte("due_at", endOfToday(now).toISOString()).in("status", OPEN);
  if (opts.where) q = q.or(opts.where);

  if (opts.countOnly) {
    const { error, count } = await q;
    if (error) throw new Error(`fila: ${error.message}`);
    return { rows: [], total: count ?? 0, nextCursor: null };
  }

  for (const k of keysFor(filter))
    q = q.order(k.col, { ascending: k.asc, nullsFirst: k.asc ? false : !!k.nullable });

  const { data, error, count } = await q.limit(opts.page ? opts.limit + 1 : opts.limit);
  if (error) throw new Error(`fila: ${error.message}`);
  const raw = data ?? [];
  const more = opts.page === true && raw.length > opts.limit;
  const kept = more ? raw.slice(0, opts.limit) : raw;
  const last = kept.at(-1);
  const rows = kept.map(toRow).filter((r): r is QueueRow => r !== null);
  return {
    rows,
    total: count ?? rows.length,
    nextCursor: more && last ? cursorOf(keysFor(filter), last) : null,
  };
}

export interface NewsroomKpis {
  publishedToday: number;
  auto24h: number;
  exceptions: number;
  overdue: number;
  scheduled: number;
}

/** Indicadores do dia (E01). Contagens com a sessão de quem consulta. */
export async function newsroomKpis(): Promise<NewsroomKpis> {
  const ctx = await studioContext();
  const now = ctx.now();
  const base = () => ctx.db.from("studio_queue").select("id", { count: "exact", head: true });
  const count = async (
    q: PromiseLike<{ count: number | null; error: { message: string } | null }>,
  ) => {
    const r = await q;
    if (r.error) throw new Error(`kpi: ${r.error.message}`);
    return r.count ?? 0;
  };
  const [publishedToday, auto24h, exceptions, overdue, scheduled] = await Promise.all([
    count(base().in("status", PUBLIC).gte("published_at", startOfDay(now).toISOString())),
    count(
      base()
        .eq("publish_mode", "auto")
        .in("status", PUBLIC)
        .gte("published_at", new Date(now.getTime() - DAY_MS).toISOString()),
    ),
    count(
      base()
        .in("status", ["draft", "in_review"])
        .not("agent_id", "is", null)
        .not("review_reason", "is", null),
    ),
    count(base().lt("due_at", now.toISOString()).in("status", OPEN)),
    count(base().eq("status", "scheduled")),
  ]);
  return { publishedToday, auto24h, exceptions, overdue, scheduled };
}

/** Pessoas da equipe que podem ser responsáveis por matéria (redação e revisão). */
export async function listAssignees(): Promise<{ id: string; name: string }[]> {
  const ctx = await studioContext();
  const { data, error } = await ctx.db.rpc("studio_people");
  if (error) throw new Error(`responsáveis: ${error.message}`);
  const desk = new Set(["editor_chefe", "editor", "jornalista", "revisor"]);
  return (data ?? [])
    .filter((p) => p.roles.some((r) => desk.has(r)))
    .map((p) => ({ id: p.id, name: p.name }));
}

/** Editorias para os filtros do Estúdio. */
export async function listSectionOptions(): Promise<{ value: string; label: string }[]> {
  const ctx = await studioContext();
  const { data, error } = await ctx.db.from("sections").select("slug, name").order("name");
  if (error) throw new Error(`editorias: ${error.message}`);
  return (data ?? []).map((s) => ({ value: s.slug, label: s.name }));
}
