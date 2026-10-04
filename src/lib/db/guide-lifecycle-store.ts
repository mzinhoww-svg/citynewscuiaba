import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { AutoPublishDeps, RefreshDueDeps, ReportDeps } from "@/lib/guide/lifecycle";
import { refreshDueAt } from "@/lib/guide/lifecycle";
import { guideSystemAudit } from "./guide-audit";
import { createGuideListStore, templateFromRow } from "./guide-list-store";

/**
 * Ciclo de vida das listas no banco (service role): publicação pelas regras, atualização de 90 dias,
 * suspensão e a reclamação de um lugar. Toda ação sem pessoa por trás é auditada como `system:guide`.
 */
export function createLifecycleStore(db: DbClient) {
  const lists = createGuideListStore(db);

  const flag = async (key: string): Promise<boolean> => {
    const { data, error } = await db
      .from("feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();
    return !error && data?.enabled === true;
  };

  const publish: AutoPublishDeps["publish"] = async (listId, at) => {
    const next = refreshDueAt(at).toISOString();
    const { data, error } = await db
      .from("guide_lists")
      .update({
        status: "published",
        published_at: at.toISOString(),
        refreshed_at: at.toISOString(),
        next_refresh_at: next,
        published_by: "rule",
      })
      .eq("id", listId)
      .select("slug")
      .maybeSingle();
    if (error) throw new Error(`guide auto publish: ${error.message}`);
    await db
      .from("guide_proposals")
      .update({ status: "published", decided_by: "rule", decided_at: at.toISOString() })
      .eq("list_id", listId)
      .eq("status", "open");
    await guideSystemAudit(db, "guide.publish", `guide_list:${listId}`, {
      by: "rule",
      slug: data?.slug ?? null,
    });
  };

  const suspend = async (listId: string, reason: string, at: Date) => {
    const { error } = await db
      .from("guide_lists")
      .update({ status: "suspended", suspended_at: at.toISOString(), suspended_reason: reason })
      .eq("id", listId);
    if (error) throw new Error(`guide suspend: ${error.message}`);
    await guideSystemAudit(db, "guide.suspend", `guide_list:${listId}`, { reason });
  };

  const apply: RefreshDueDeps["apply"] = async (listId, items, at, next) => {
    await lists.replaceItems(listId, items);
    const { error } = await db
      .from("guide_lists")
      .update({
        refreshed_at: at.toISOString(),
        next_refresh_at: next.toISOString(),
        take: Math.min(Math.max(items.length, 3), 20),
      })
      .eq("id", listId);
    if (error) throw new Error(`guide refresh: ${error.message}`);
    await guideSystemAudit(db, "guide.refresh", `guide_list:${listId}`, { items: items.length });
  };

  return {
    flag,
    publish,
    suspend,
    apply,

    autoPublishDeps(now: () => Date): AutoPublishDeps {
      return { enabled: () => flag("guide_auto_publish"), publish, now };
    },

    /** Listas publicadas com a atualização vencida, já com modelo e lugares. */
    async due(now: Date, limit: number): Promise<Awaited<ReturnType<RefreshDueDeps["due"]>>> {
      const { data, error } = await db
        .from("guide_lists")
        .select("id")
        .eq("status", "published")
        .lte("next_refresh_at", now.toISOString())
        .order("next_refresh_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`guide due: ${error.message}`);
      const out: Awaited<ReturnType<RefreshDueDeps["due"]>> = [];
      for (const row of data ?? []) {
        const l = await lists.getList(row.id);
        if (!l) continue;
        let template = null;
        if (l.template_id) {
          const t = await db
            .from("guide_templates")
            .select("*")
            .eq("id", l.template_id)
            .maybeSingle();
          if (t.data) template = templateFromRow(t.data);
        }
        out.push({
          id: l.id,
          slug: l.slug,
          origin: l.origin === "link" || l.origin === "manual" ? l.origin : "template",
          category: l.category,
          subcategory: l.subcategory,
          neighborhood: l.neighborhood,
          criteria: l.criteria,
          sponsored: l.sponsored,
          template,
          items: l.items.map((i) => ({ venue: i.venue, note: i.editorNote })),
        });
      }
      return out;
    },

    refreshDeps(now: () => Date): Omit<RefreshDueDeps, "due" | "revalidate"> {
      return {
        venuesOf: (category) => lists.venuesFor({ category }),
        mentions: (venues) => lists.mentions(venues),
        apply,
        suspend,
        now,
      };
    },

    /** `guide_report_venue` + os endereços que precisam ser invalidados. */
    async report(
      venueId: string,
      reason: string,
      contact: string | null,
    ): ReturnType<ReportDeps["report"]> {
      const { data, error } = await db.rpc("guide_report_venue", {
        p_venue: venueId,
        p_reason: reason,
        ...(contact ? { p_contact: contact } : {}),
      });
      if (error) throw new Error(`guide report: ${error.message}`);
      const body = data as { reportId: string; suspendedLists: string[] };
      const venue = await db.from("venues").select("slug").eq("id", venueId).maybeSingle();
      await guideSystemAudit(db, "guide.suspend", `venue:${venueId}`, {
        reason: "reclamação de leitor",
        reportId: body.reportId,
        lists: body.suspendedLists,
      });
      return {
        reportId: body.reportId,
        suspendedLists: body.suspendedLists,
        venueSlug: venue.data?.slug ?? "",
        listSlugs: body.suspendedLists,
      };
    },
  };
}
