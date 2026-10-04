import "server-only";
import { z } from "zod";
import { FEATURED_TEXT as T } from "@/content/pt-BR/featured";
import { can } from "@/lib/auth/permissions";
import { PUBLIC_STATUSES, summarize } from "@/lib/db/queries/articles";
import { ARTICLE_COLUMNS } from "@/lib/db/queries/articles";
import { featuredHistory, type FeaturedHistoryRow } from "@/lib/db/queries/admin";
import { getFeatured, type FeaturedResult } from "@/lib/db/queries/featured";
import { many } from "@/lib/db/queries/run";
import type { ArticleSummary } from "@/lib/db/queries/types";
import {
  hasApprovedCover,
  PIN_DURATIONS,
  pinEndsAt,
  validatePin,
  type FeaturedPage,
  type FeaturedSource,
  type PinError,
  type Slot,
  type SlotKey,
} from "@/lib/featured";
import { StudioFailure, studioAction } from "./action";
import { studioContext } from "./context";

/*
 * Destaques por posição no Estúdio (FD-T3): fixar, remover e reordenar matérias em cada posição
 * (home, editorias, explorar). `featured.manage` (admin e editor-chefe); modo leitura bloqueia;
 * toda ação grava auditoria e invalida as tags de cache das páginas afetadas. A escrita passa
 * pelas funções do banco (0090), que conferem o papel de novo e nunca apagam linha (remover
 * grava `ended_at`).
 */

const DurationSchema = z.union([
  z.enum(PIN_DURATIONS),
  z.object({ until: z.coerce.date() }).transform((v) => ({ until: v.until })),
]);

const PinSchema = z.object({
  slotKey: z.string().trim().min(1).max(60),
  sectionSlug: z.string().trim().min(1).max(80).optional(),
  articleId: z.string().uuid(),
  duration: DurationSchema,
  note: z.string().trim().max(300).optional(),
  /** Fixação que esta troca encerra (botão Trocar), na mesma transação. */
  replaceId: z.string().uuid().optional(),
});
export type PinArticleInput = z.input<typeof PinSchema>;

const ERROR_TEXT: Record<PinError, string> = {
  duration: T.error.duration,
  ineligible: T.error.ineligible,
  capacity: T.error.capacity,
  slot: T.error.slot,
  no_cover: T.error.no_cover,
};

/** Tags de cache das páginas que leem a posição. */
export function featuredTags(page: FeaturedPage | undefined, section?: string | null): string[] {
  const tags = new Set<string>();
  if (!page || page === "home") tags.add("home");
  if (!page || page === "explorar") tags.add("explore");
  if (page === "editoria" && section) tags.add(`section:${section}`);
  return [...tags];
}

/** Mensagem `featured:<código>` das funções do banco → falha tipada do Estúdio. */
function dbFailure(error: { code?: string; message: string }): StudioFailure {
  const key = /featured:(\w+)/.exec(error.message)?.[1];
  if (error.code === "42501" || key === "forbidden")
    return new StudioFailure("forbidden", T.error.forbidden);
  if (key === "not_found") return new StudioFailure("not_found", T.error.not_found);
  if (key && key in ERROR_TEXT) {
    return new StudioFailure(
      key === "capacity" ? "conflict" : "invalid",
      ERROR_TEXT[key as PinError],
    );
  }
  return new StudioFailure("conflict", T.error.generic);
}

async function slotOf(
  db: Parameters<typeof getFeatured>[0],
  key: SlotKey,
): Promise<Slot | undefined> {
  const rows = await db
    .from("featured_slots")
    .select("key, page, label, capacity")
    .eq("key", key)
    .then(many);
  const r = rows[0];
  return r
    ? { key: r.key, page: r.page as FeaturedPage, label: r.label, capacity: r.capacity }
    : undefined;
}

export const pinArticle = studioAction(
  "featured.manage",
  () => ({}),
  async (i: z.output<typeof PinSchema>, ctx): Promise<{ id: string }> => {
    const now = ctx.now();
    const endsAt = pinEndsAt(i.duration, now);
    const slot = await slotOf(ctx.db, i.slotKey);

    const [articleRes, coverRes, activeRes] = await Promise.all([
      ctx.db.from("articles").select("id, status, sponsored").eq("id", i.articleId).maybeSingle(),
      ctx.db.rpc("featured_has_cover", { p_article: i.articleId }),
      ctx.db
        .from("featured_items")
        .select("id, ends_at, kind")
        .eq("slot_key", i.slotKey)
        .is("ended_at", null)
        .then((r) => r),
    ]);
    if (articleRes.error) throw new Error(`featured article: ${articleRes.error.message}`);
    if (!articleRes.data) throw new StudioFailure("not_found", T.error.ineligible);
    // Só os manuais ocupam vaga do admin: a pauta quente nunca impede fixar (R8, manual vence).
    const active = (activeRes.data ?? []).filter(
      (p) =>
        p.kind !== "hot" &&
        (!p.ends_at || Date.parse(p.ends_at) > now.getTime()) &&
        p.id !== i.replaceId,
    ).length;

    const checked = validatePin({
      slot,
      sectionSlug: i.sectionSlug ?? null,
      article: {
        status: articleRes.data.status,
        sponsored: articleRes.data.sponsored,
        hasCover: coverRes.data === true,
      },
      endsAt,
      // Em posição por editoria a vaga é contada por editoria: o banco é a barreira final.
      activeInSlot: slot?.page === "editoria" ? 0 : active,
      now,
    });
    if (!checked.ok) throw new StudioFailure("invalid", ERROR_TEXT[checked.error]);

    const { data, error } = await ctx.db.rpc("featured_pin", {
      p_slot: checked.value.slotKey,
      p_section: checked.value.sectionSlug,
      p_article: i.articleId,
      p_ends_at: checked.value.endsAt ? checked.value.endsAt.toISOString() : null,
      p_note: i.note ?? "",
      p_replace: i.replaceId ?? null,
    });
    if (error) throw dbFailure(error);
    ctx.setObjectRef(`featured:${data}`);
    ctx.detail({
      slot: i.slotKey,
      section: i.sectionSlug ?? null,
      article: i.articleId,
      endsAt: checked.value.endsAt?.toISOString() ?? null,
      replaced: i.replaceId ?? null,
      note: i.note ?? null,
    });
    await ctx.revalidate(featuredTags(slot?.page, i.sectionSlug));
    return { id: String(data) };
  },
  {
    schema: PinSchema,
    auditAs: "featured.pin",
    objectRef: (i) => `featured:${i.slotKey}`,
  },
);

const UnpinSchema = z.object({ id: z.string().uuid() });

export const unpin = studioAction(
  "featured.manage",
  () => ({}),
  async (i: z.output<typeof UnpinSchema>, ctx): Promise<{ id: string }> => {
    const found = await ctx.db
      .from("featured_items")
      .select("slot_key, section_slug, article_id, ends_at")
      .eq("id", i.id)
      .maybeSingle();
    if (found.error) throw new Error(`featured unpin: ${found.error.message}`);
    if (!found.data) throw new StudioFailure("not_found", T.error.not_found);
    const { error } = await ctx.db.rpc("featured_unpin", { p_id: i.id });
    if (error) throw dbFailure(error);
    const slot = await slotOf(ctx.db, found.data.slot_key);
    ctx.detail({
      slot: found.data.slot_key,
      section: found.data.section_slug,
      article: found.data.article_id,
      wasUntil: found.data.ends_at,
    });
    await ctx.revalidate(featuredTags(slot?.page, found.data.section_slug));
    return { id: i.id };
  },
  { schema: UnpinSchema, auditAs: "featured.unpin", objectRef: (i) => `featured:${i.id}` },
);

const DismissSchema = z.object({ id: z.string().uuid() });

/**
 * Dispensa a pauta quente (HOT-T3): encerra os pinos quentes vigentes do assunto e grava
 * `dismissed_at`; o mesmo sinal dos portais não traz o assunto de volta (só um sinal novo, depois
 * da dispensa). Mesma permissão das outras ações de destaque; modo leitura bloqueia.
 */
export const dismissHot = studioAction(
  "featured.manage",
  () => ({}),
  async (i: z.output<typeof DismissSchema>, ctx): Promise<{ id: string; count: number }> => {
    const found = await ctx.db
      .from("featured_items")
      .select("slot_key, section_slug, article_id, topic_id, kind, hot_sources")
      .eq("id", i.id)
      .maybeSingle();
    if (found.error) throw new Error(`featured dismiss: ${found.error.message}`);
    if (!found.data || found.data.kind !== "hot")
      throw new StudioFailure("not_found", T.error.not_found);
    const { data, error } = await ctx.db.rpc("featured_dismiss_hot", { p_id: i.id });
    if (error) throw dbFailure(error);
    ctx.detail({
      slot: found.data.slot_key,
      section: found.data.section_slug,
      article: found.data.article_id,
      topic: found.data.topic_id,
      portals: found.data.hot_sources,
      ended: Number(data ?? 0),
    });
    // O assunto pode ocupar a home e a editoria: invalida as duas.
    await ctx.revalidate([
      "home",
      ...(found.data.section_slug ? [`section:${found.data.section_slug}`] : []),
    ]);
    return { id: i.id, count: Number(data ?? 0) };
  },
  {
    schema: DismissSchema,
    auditAs: "featured.dismiss_hot",
    objectRef: (i) => `featured:${i.id}`,
  },
);

const ReorderSchema = z.object({
  slotKey: z.string().trim().min(1).max(60),
  ids: z.array(z.string().uuid()).min(1).max(20),
});

export const reorder = studioAction(
  "featured.manage",
  () => ({}),
  async (i: z.output<typeof ReorderSchema>, ctx): Promise<{ count: number }> => {
    const { data, error } = await ctx.db.rpc("featured_reorder", {
      p_slot: i.slotKey,
      p_ids: i.ids,
    });
    if (error) throw dbFailure(error);
    const slot = await slotOf(ctx.db, i.slotKey);
    ctx.detail({ slot: i.slotKey, order: i.ids });
    await ctx.revalidate(featuredTags(slot?.page));
    return { count: Number(data ?? i.ids.length) };
  },
  { schema: ReorderSchema, auditAs: "featured.update", objectRef: (i) => `featured:${i.slotKey}` },
);

/** Escapa curingas do `ilike` para a busca por título ser literal. */
function likeTerm(q: string): string {
  return q
    .replace(/[%_\\,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca de matérias que podem ser fixadas: só publicadas e não patrocinadas (a capa aprovada
 * vem em `image`; sem ela a tela avisa e bloqueia). Sem a permissão, devolve vazio.
 */
export async function searchEligibleArticles(q: string, limit = 10): Promise<ArticleSummary[]> {
  const ctx = await studioContext();
  if (!ctx.session || !can(ctx.session.roles, "featured.manage")) return [];
  const term = likeTerm(q).slice(0, 80);
  if (term.length < 2) return [];
  const rows = await ctx.db
    .from("articles")
    .select(ARTICLE_COLUMNS)
    .in("status", [...PUBLIC_STATUSES])
    .eq("sponsored", false)
    .ilike("title", `%${term}%`)
    .order("published_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 25))
    .then(many);
  const eligible = rows.filter(
    (r) => !r.sponsored && (PUBLIC_STATUSES as readonly string[]).includes(r.status),
  );
  return summarize(ctx.db, eligible);
}

// ---------------------------------------------------------------------------
// Quadro
// ---------------------------------------------------------------------------

export interface BoardItem {
  /** Fixação que mantém a matéria nesta posição; `null` = automático. */
  pinId: string | null;
  articleId: string;
  title: string;
  href: string;
  sectionName: string;
  publishedAt: string;
  imageSrc: string | null;
  /** Fixação já feita: quem fixou (nome) e a observação. */
  pinnedBy: string | null;
  note: string;
  endsAt: string | null;
  /** Pauta quente (HOT-T3): o pino quente que mantém a matéria aqui e quantos portais a sustentam. */
  hot: { pinId: string; portals: number; endsAt: string | null } | null;
}

export interface BoardSlot {
  /** `home.lead`, `editoria.lead:politica`... único no quadro. */
  id: string;
  slotKey: SlotKey;
  label: string;
  page: FeaturedPage;
  capacity: number;
  section: { slug: string; name: string } | null;
  items: BoardItem[];
  source: FeaturedSource;
  /** Quando o ocupante automático será reavaliado (ISO); `null` = sem previsão. */
  until: string | null;
  /** Fixações que não puderam ocupar a posição (para o aviso). */
  dropped: { pinId: string; title: string; reason: "gone" | "ineligible" | "no_cover" }[];
  /** Vagas livres para fixar mais matérias. */
  free: number;
}

type BoardDb = Parameters<typeof getFeatured>[0];

async function titlesOf(db: BoardDb, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.from("articles").select("id, title").in("id", ids).then(many);
  return new Map(rows.map((r) => [r.id, r.title]));
}

function toBoardItem(
  a: ArticleSummary,
  pin: { id: string; endsAt: string | null; by: string | null; note: string } | undefined,
  hot: BoardItem["hot"] = null,
): BoardItem {
  return {
    pinId: pin?.id ?? null,
    articleId: a.id,
    title: a.title,
    href: a.href,
    sectionName: a.section.name,
    publishedAt: a.publishedAt,
    imageSrc: hasApprovedCover(a.image) ? (a.image?.src ?? null) : null,
    pinnedBy: pin?.by ?? null,
    note: pin?.note ?? "",
    endsAt: pin?.endsAt ?? null,
    hot,
  };
}

/**
 * Cada posição com o ocupante agora (manual ou automático) e até quando. `editoria.lead` vira
 * uma posição por editoria de topo. Lê com a sessão da pessoa (RLS de equipe vê tudo).
 */
export async function currentBoard(now?: Date): Promise<BoardSlot[]> {
  const ctx = await studioContext();
  const at = now ?? ctx.now();
  const db = ctx.db;
  const [slots, sections, pinRows] = await Promise.all([
    db
      .from("featured_slots")
      .select("key, page, label, capacity, position")
      .order("position")
      .then(many),
    db.from("sections").select("slug, name, parent_slug").then(many),
    db
      .from("featured_items")
      .select(
        "id, kind, slot_key, section_slug, article_id, ends_at, created_by, note, starts_at, dismissed_at, hot_sources",
      )
      .is("ended_at", null)
      .then(many),
  ]);
  const people = new Map<string, string>();
  const creators = [...new Set(pinRows.map((p) => p.created_by).filter((v): v is string => !!v))];
  if (creators.length) {
    const profiles = await db
      .from("profiles")
      .select("id, display_name")
      .in("id", creators)
      .then(many);
    for (const p of profiles) people.set(p.id, p.display_name);
  }
  const top = sections.filter((s) => !s.parent_slug);

  type Expanded = { s: (typeof slots)[number]; section: { slug: string; name: string } | null };
  const expanded: Expanded[] = slots.flatMap((s): Expanded[] =>
    s.page === "editoria"
      ? top.map((sec) => ({ s, section: { slug: sec.slug, name: sec.name } }))
      : [{ s, section: null }],
  );

  const board = await Promise.all(
    expanded.map(async ({ s, section }): Promise<BoardSlot> => {
      const r: FeaturedResult = await getFeatured(db, s.key, { section: section?.slug, now: at });
      const here = pinRows.filter(
        (p) =>
          p.slot_key === s.key &&
          (p.section_slug ?? null) === (section?.slug ?? null) &&
          (!p.ends_at || Date.parse(p.ends_at) > at.getTime()) &&
          Date.parse(p.starts_at) <= at.getTime(),
      );
      // Vaga do admin = pinos manuais; a pauta quente nunca bloqueia fixar (manual vence).
      const mine = here.filter((p) => p.kind !== "hot");
      const hotHere = here.filter((p) => p.kind === "hot" && !p.dismissed_at);
      const byArticle = new Map(mine.map((p) => [p.article_id, p]));
      const hotByArticle = new Map(hotHere.map((p) => [p.article_id, p]));
      const items = r.items.map((a) => {
        const p = byArticle.get(a.id);
        const h = r.hot.includes(a.id) ? hotByArticle.get(a.id) : undefined;
        return toBoardItem(
          a,
          p
            ? {
                id: p.id,
                endsAt: p.ends_at,
                by: p.created_by ? (people.get(p.created_by) ?? null) : null,
                note: p.note,
              }
            : undefined,
          h ? { pinId: h.id, portals: h.hot_sources ?? 0, endsAt: h.ends_at } : null,
        );
      });
      const titles = await titlesOf(
        db,
        r.dropped.map((d) => d.articleId),
      );
      return {
        id: section ? `${s.key}:${section.slug}` : s.key,
        slotKey: s.key,
        label: section ? `${section.name} · destaque` : s.label,
        page: s.page as FeaturedPage,
        capacity: s.capacity,
        section,
        items,
        source: r.source,
        until: r.until ? r.until.toISOString() : null,
        dropped: r.dropped.map((d) => ({
          pinId: d.pinId,
          title: titles.get(d.articleId) ?? "Matéria",
          reason: d.reason,
        })),
        free: Math.max(0, s.capacity - mine.length),
      };
    }),
  );
  return board;
}

/** Últimos 30 pinos (inclui removidos e expirados), do mais novo para o mais antigo. */
export async function pinHistory(): Promise<FeaturedHistoryRow[]> {
  const ctx = await studioContext();
  return featuredHistory(ctx.db, 30, ctx.now());
}
