import "server-only";
import type { HotArticle, HotPinRepo, PinRecord } from "@/lib/featured/hot-pin";
import { DEFAULT_SLOTS } from "@/lib/featured/types";
import { asScope } from "@/lib/geo/news-scope";
import type { DbClient } from "./client";

/*
 * Banco da pauta quente (HOT-T3, service role): lê `front_signals`, a flag `hot_featured_enabled`,
 * `featured.hot_min_sources`, as matérias dos assuntos quentes e os pinos de `featured_items`; grava
 * só pinos `kind = 'hot'` (inserir, estender `ends_at`, encerrar com `ended_at`). Nunca apaga linha
 * e nunca toca em `articles`.
 */

function check(op: string, error: { message: string } | null): void {
  if (error) throw new Error(`hot-pin-store: ${op}: ${error.message}`);
}

const PIN_COLUMNS =
  "id, kind, slot_key, section_slug, article_id, topic_id, starts_at, ends_at, ended_at, dismissed_at";

interface PinRow {
  id: string;
  kind: string;
  slot_key: string;
  section_slug: string | null;
  article_id: string;
  topic_id: string | null;
  starts_at: string;
  ends_at: string | null;
  ended_at: string | null;
  dismissed_at: string | null;
}

const date = (v: string | null): Date | null => (v ? new Date(v) : null);

function toRecord(r: PinRow): PinRecord {
  return {
    id: r.id,
    kind: r.kind === "hot" ? "hot" : "manual",
    slotKey: r.slot_key,
    sectionSlug: r.section_slug,
    articleId: r.article_id,
    topicId: r.topic_id,
    startsAt: new Date(r.starts_at),
    endsAt: date(r.ends_at),
    endedAt: date(r.ended_at),
    dismissedAt: date(r.dismissed_at),
  };
}

export function createHotPinRepo(db: DbClient): HotPinRepo {
  return {
    async hotEnabled() {
      const { data, error } = await db
        .from("feature_flags")
        .select("enabled")
        .eq("key", "hot_featured_enabled")
        .maybeSingle();
      // Falha fechada, como as demais flags: ausente ou erro = desligada.
      return !error && data?.enabled === true;
    },

    async minSources() {
      const { data, error } = await db
        .from("app_settings")
        .select("value")
        .eq("key", "featured.hot_min_sources")
        .maybeSingle();
      if (error || !data) return null;
      const n = Number(data.value);
      return Number.isInteger(n) && n >= 2 && n <= 10 ? n : null;
    },

    async signals(since) {
      const { data, error } = await db
        .from("front_signals")
        .select("source_id, topic_id, rank, seen_at")
        .not("topic_id", "is", null)
        .gte("seen_at", since.toISOString())
        .limit(5000);
      check("front_signals", error);
      return (data ?? []).flatMap((r) =>
        r.topic_id
          ? [
              {
                sourceId: r.source_id,
                topicId: r.topic_id,
                rank: r.rank,
                seenAt: new Date(r.seen_at),
              },
            ]
          : [],
      );
    },

    async slots() {
      const { data, error } = await db.from("featured_slots").select("key, capacity");
      if (error || !data?.length)
        return DEFAULT_SLOTS.map((s) => ({ key: s.key, capacity: s.capacity }));
      return data.map((s) => ({ key: s.key, capacity: s.capacity }));
    },

    async articlesOfTopics(topicIds) {
      if (topicIds.length === 0) return [];
      const [arts, sections] = await Promise.all([
        db
          .from("articles")
          .select(
            "id, topic_id, status, sponsored, section_slug, news_scope, national_commotion, confidence_score, published_at",
          )
          .in("topic_id", topicIds)
          .order("published_at", { ascending: false })
          .limit(200),
        db.from("sections").select("slug, parent_slug"),
      ]);
      check("articles", arts.error);
      check("sections", sections.error);
      const parent = new Map((sections.data ?? []).map((s) => [s.slug, s.parent_slug]));
      const rows = (arts.data ?? []).filter((r) => r.topic_id);
      // Capa aprovada (R39) pela mesma função do banco que o admin usa; só das publicadas.
      const covers = new Map<string, boolean>();
      await Promise.all(
        rows
          .filter((r) => r.status === "published" || r.status === "updated")
          .map(async (r) => {
            const { data } = await db.rpc("featured_has_cover", { p_article: r.id });
            covers.set(r.id, data === true);
          }),
      );
      return rows.map((r): HotArticle => ({
        id: r.id,
        topicId: r.topic_id!,
        status: r.status,
        sponsored: r.sponsored,
        hasCover: covers.get(r.id) === true,
        sectionSlug: r.section_slug,
        sectionRoot: parent.get(r.section_slug) ?? r.section_slug,
        newsScope: asScope(r.news_scope),
        nationalCommotion: r.national_commotion === true,
        confidenceScore: Number(r.confidence_score ?? 0),
        publishedAt: date(r.published_at),
      }));
    },

    async activePins(now) {
      const iso = now.toISOString();
      const { data, error } = await db
        .from("featured_items")
        .select(PIN_COLUMNS)
        .is("ended_at", null)
        .lte("starts_at", iso)
        .or(`ends_at.is.null,ends_at.gt.${iso}`);
      check("featured_items ativos", error);
      return (data ?? []).map(toRecord);
    },

    async topicHotPins(topicIds, since) {
      if (topicIds.length === 0) return [];
      const iso = since.toISOString();
      const { data, error } = await db
        .from("featured_items")
        .select(PIN_COLUMNS)
        .eq("kind", "hot")
        .in("topic_id", topicIds)
        .or(`starts_at.gte.${iso},dismissed_at.gte.${iso}`);
      check("featured_items do assunto", error);
      return (data ?? []).map(toRecord);
    },

    async insertPin(p) {
      const { error } = await db.from("featured_items").insert({
        kind: "hot",
        slot_key: p.slotKey,
        section_slug: p.sectionSlug,
        article_id: p.articleId,
        topic_id: p.topicId,
        position: p.position,
        starts_at: p.startsAt.toISOString(),
        ends_at: p.endsAt.toISOString(),
        hot_sources: p.sources,
        note: "Pauta quente",
      });
      check("featured_items inserir", error);
    },

    async extendPin(id, endsAt, sources) {
      const { error } = await db
        .from("featured_items")
        .update({ ends_at: endsAt.toISOString(), hot_sources: sources })
        .eq("id", id)
        .eq("kind", "hot")
        .is("ended_at", null);
      check("featured_items renovar", error);
    },

    async endPin(id, at) {
      const { error } = await db
        .from("featured_items")
        .update({ ended_at: at.toISOString() })
        .eq("id", id)
        .eq("kind", "hot")
        .is("ended_at", null);
      check("featured_items encerrar", error);
    },
  };
}
