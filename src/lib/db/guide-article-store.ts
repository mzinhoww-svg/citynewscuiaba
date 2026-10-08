import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { WriteStepDeps } from "@/lib/guide/write-step";
import { guideSystemAudit } from "./guide-audit";
import { venueFromRow } from "./guide-store";

/** Comentário do lugar cabe no limite da coluna (`editor_note`, 400). */
const NOTE_MAX = 400;

/**
 * Texto das listas no banco (service role, A-214). Lê as listas publicadas com os lugares na ordem
 * e grava o texto do Guia sem tocar no que o editor escreveu (`intro_auto`, `note_auto`).
 */
export function createGuideArticleStore(db: DbClient): Pick<WriteStepDeps, "published" | "save"> {
  return {
    async published() {
      const { data, error } = await db
        .from("guide_lists")
        .select(
          "id, slug, title, category, intro, intro_auto, article_signature, guide_list_items(position, venues(*))",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(`guide article lists: ${error.message}`);
      return (data ?? []).map((l) => ({
        id: l.id,
        slug: l.slug,
        title: l.title,
        category: l.category,
        hasIntro: !!l.intro?.trim(),
        introAuto: l.intro_auto,
        signature: l.article_signature,
        items: (l.guide_list_items ?? []).flatMap((i) =>
          i.venues ? [{ position: i.position, venue: venueFromRow(i.venues) }] : [],
        ),
      }));
    },

    async save(listId, a) {
      const up = await db
        .from("guide_lists")
        .update({ intro: a.intro, intro_auto: true, article_signature: a.signature })
        .eq("id", listId)
        .or("intro.is.null,intro_auto.eq.true");
      if (up.error) throw new Error(`guide article save: ${up.error.message}`);
      const items = await db
        .from("guide_list_items")
        .select("venue_id, editor_note, note_auto")
        .eq("list_id", listId);
      if (items.error) throw new Error(`guide article notes: ${items.error.message}`);
      for (const it of items.data ?? []) {
        // Comentário do editor fica; o do Guia é trocado (ou apagado se o lugar não tem comentário).
        if (it.editor_note && !it.note_auto) continue;
        const note = a.notes[it.venue_id]?.slice(0, NOTE_MAX) ?? null;
        if (note === it.editor_note) continue;
        const r = await db
          .from("guide_list_items")
          .update({ editor_note: note, note_auto: note !== null })
          .eq("list_id", listId)
          .eq("venue_id", it.venue_id);
        if (r.error) throw new Error(`guide article note: ${r.error.message}`);
      }
      await guideSystemAudit(db, "guide.article", `guide_list:${listId}`, {
        chars: a.intro.length,
        notes: Object.keys(a.notes).length,
      });
    },
  };
}
