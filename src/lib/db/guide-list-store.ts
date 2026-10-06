import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Database, Json } from "@/lib/db/types";
import type { EngineStore, ProposalWrite, TemplateRow } from "@/lib/guide/engine";
import type { Weights } from "@/lib/guide/score";
import type { GuideItem, ListOrigin, Venue } from "@/lib/guide/types";
import { slugify } from "@/lib/pipeline/slug";
import { venueFromRow } from "./guide-store";

type ListRow = Database["public"]["Tables"]["guide_lists"]["Row"];
type TemplateDbRow = Database["public"]["Tables"]["guide_templates"]["Row"];

/** Dias sem repetir um modelo cuja lista foi descartada. */
const REPROPOSE_AFTER_DAYS = 90;
export const REFRESH_DAYS = 90;
const DAY = 86_400_000;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

function parseWeights(w: Json | null): Weights | null {
  if (!w || typeof w !== "object" || Array.isArray(w)) return null;
  const o = w as Record<string, unknown>;
  const n = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : 0);
  return {
    rating: n("rating"),
    rank: n("rank"),
    mentions: n("mentions"),
    completeness: n("completeness"),
  };
}

export function templateFromRow(r: TemplateDbRow): TemplateRow {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    noun: r.noun || undefined,
    category: r.category,
    subcategory: r.subcategory,
    neighborhood: r.neighborhood,
    take: r.take,
    minVenues: r.min_venues,
    weights: parseWeights(r.weights),
  };
}

export interface ListWithItems extends ListRow {
  items: (GuideItem & { venue: Venue })[];
}

/** Listas, propostas e modelos do Guia no banco. O cliente decide o acesso (RLS ou service role). */
export function createGuideListStore(db: DbClient): EngineStore & {
  venuesByIds(ids: readonly string[]): Promise<Venue[]>;
  getList(id: string): Promise<ListWithItems | null>;
  replaceItems(listId: string, items: GuideItem[]): Promise<void>;
} {
  const store = {
    async nextTemplate(now: Date) {
      const { data, error } = await db
        .from("guide_templates")
        .select("*")
        .eq("active", true)
        .order("last_proposed_at", { ascending: true, nullsFirst: true })
        .order("slug")
        .limit(100);
      if (error) throw new Error(`guide templates: ${error.message}`);
      const rows = data ?? [];
      if (rows.length === 0) return null;
      const since = new Date(now.getTime() - REPROPOSE_AFTER_DAYS * DAY).toISOString();
      const lists = await db
        .from("guide_lists")
        .select("template_id, status, created_at")
        .in(
          "template_id",
          rows.map((r) => r.id),
        );
      if (lists.error) throw new Error(`guide lists: ${lists.error.message}`);
      // Modelo com lista em andamento ou descartada há pouco tempo fica de fora.
      const busy = new Set(
        (lists.data ?? [])
          .filter((l) => l.status !== "discarded" || l.created_at >= since)
          .map((l) => l.template_id),
      );
      const next = rows.find((r) => !busy.has(r.id));
      return next ? templateFromRow(next) : null;
    },

    async venuesFor(t: { category: string }) {
      const { data, error } = await db
        .from("venues")
        .select("*")
        .eq("category", t.category)
        .limit(5000);
      if (error) throw new Error(`venues for template: ${error.message}`);
      return (data ?? []).map(venueFromRow);
    },

    async venuesByIds(ids: readonly string[]) {
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from("venues")
        .select("*")
        .in("id", [...ids]);
      if (error) throw new Error(`venues by ids: ${error.message}`);
      return (data ?? []).map(venueFromRow);
    },

    /** Matérias publicadas que citam o lugar pelo nome (busca de frase em português). */
    async mentions(venues: readonly Venue[]) {
      const out = new Map<string, number>();
      const ids: string[] = [];
      const phrases: string[] = [];
      for (const v of venues.slice(0, 80)) {
        const phrase = fold(v.name);
        if (phrase.split(/\s+/).length < 2) continue;
        ids.push(v.id);
        phrases.push(phrase);
      }
      if (ids.length === 0) return out;
      // Uma chamada para todos os lugares (antes, uma busca de frase por lugar).
      const { data, error } = await db.rpc("guide_venue_mentions", {
        p_ids: ids,
        p_phrases: phrases,
      });
      if (error) throw new Error(`guide mentions: ${error.message}`);
      const counts = new Map((data ?? []).map((r) => [r.venue_id, r.mentions]));
      for (const id of ids) out.set(id, counts.get(id) ?? 0);
      return out;
    },

    async markProposed(templateId: string, at: Date) {
      const { error } = await db
        .from("guide_templates")
        .update({ last_proposed_at: at.toISOString() })
        .eq("id", templateId);
      if (error) throw new Error(`guide template mark: ${error.message}`);
    },

    async createProposal(w: ProposalWrite) {
      const p = w.proposal;
      const origin: ListOrigin = p.origin;
      const createdBy = w.createdBy ?? null;
      const sourceUrl = w.sourceUrl ?? null;
      const base = p.slug || slugify(p.title, 100);
      const tryInsert = async (slug: string) =>
        db
          .from("guide_lists")
          .insert({
            slug,
            title: p.title,
            criteria: p.criteria,
            category: p.category,
            subcategory: p.subcategory,
            neighborhood: p.neighborhood,
            take: Math.min(Math.max(p.take, 3), 20),
            status: "proposal",
            origin,
            template_id: w.templateId || null,
            created_by: createdBy,
          })
          .select("id")
          .single();
      let res = await tryInsert(base);
      if (res.error?.code === "23505") {
        const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        res = await tryInsert(`${base}-${stamp}`);
        if (res.error?.code === "23505")
          res = await tryInsert(`${base}-${stamp}-${Math.random().toString(36).slice(2, 6)}`);
      }
      if (res.error || !res.data)
        throw new Error(`guide list insert: ${res.error?.message ?? "sem retorno"}`);
      const listId = res.data.id;
      try {
        await store.replaceItems(listId, p.items);
        const prop = await db
          .from("guide_proposals")
          .insert({
            origin,
            source_url: sourceUrl,
            template_id: w.templateId || null,
            list_id: listId,
            analysis: w.analysis as Json,
            created_by: createdBy,
          })
          .select("id")
          .single();
        if (prop.error || !prop.data)
          throw new Error(`guide proposal insert: ${prop.error?.message ?? "sem retorno"}`);
        return { listId, proposalId: prop.data.id };
      } catch (e) {
        await db.from("guide_lists").update({ status: "discarded" }).eq("id", listId);
        throw e;
      }
    },

    async getList(id: string): Promise<ListWithItems | null> {
      const list = await db.from("guide_lists").select("*").eq("id", id).maybeSingle();
      if (list.error) throw new Error(`guide list: ${list.error.message}`);
      if (!list.data) return null;
      const items = await db
        .from("guide_list_items")
        .select("position, venue_id, editor_note, score, score_breakdown, venues(*)")
        .eq("list_id", id)
        .order("position");
      if (items.error) throw new Error(`guide items: ${items.error.message}`);
      return {
        ...list.data,
        items: (items.data ?? []).flatMap((i) =>
          i.venues
            ? [
                {
                  position: i.position,
                  venueId: i.venue_id,
                  score: i.score ?? 0,
                  breakdown: (i.score_breakdown ?? {}) as Record<string, number>,
                  editorNote: i.editor_note,
                  venue: venueFromRow(i.venues),
                },
              ]
            : [],
        ),
      };
    },

    /** Troca os itens da lista (posição, nota e pontuação); a lista nunca fica sem itens no meio. */
    async replaceItems(listId: string, items: GuideItem[]) {
      const rows = items.map((i) => ({
        list_id: listId,
        venue_id: i.venueId,
        position: i.position,
        editor_note: i.editorNote,
        score: i.score,
        score_breakdown: i.breakdown as Json,
      }));
      const old = await db.from("guide_list_items").select("venue_id").eq("list_id", listId);
      if (old.error) throw new Error(`guide items read: ${old.error.message}`);
      const keep = new Set(rows.map((r) => r.venue_id));
      const gone = (old.data ?? []).map((o) => o.venue_id).filter((id) => !keep.has(id));
      if (gone.length > 0) {
        const del = await db
          .from("guide_list_items")
          .delete()
          .eq("list_id", listId)
          .in("venue_id", gone);
        if (del.error) throw new Error(`guide items remove: ${del.error.message}`);
      }
      if (rows.length > 0) {
        const up = await db
          .from("guide_list_items")
          .upsert(rows, { onConflict: "list_id,venue_id" });
        if (up.error) throw new Error(`guide items upsert: ${up.error.message}`);
      }
    },
  };
  return store;
}
