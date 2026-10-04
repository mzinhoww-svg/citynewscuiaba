import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { StaffPushPort, UrgentDue } from "@/lib/studio-notifications/push";

/** Porta do push de urgências da equipe sobre o banco (service role; só o drain a usa). */
export function createStaffPushPort(db: DbClient): StaffPushPort {
  return {
    async sweep(now) {
      const { error } = await db.rpc("studio_notifications_sweep", { p_now: now.toISOString() });
      if (error) throw new Error(`studio_notifications_sweep: ${error.message}`);
    },
    async due(now) {
      const { data, error } = await db.rpc("studio_urgent_push_due", { p_now: now.toISOString() });
      if (error) throw new Error(`studio_urgent_push_due: ${error.message}`);
      return (data ?? []).map((r): UrgentDue => ({
        id: r.id,
        title: r.title,
        body: r.body,
        href: r.href,
        subs: parseSubs(r.subs),
      }));
    },
    async done(ids) {
      if (ids.length === 0) return;
      const { error } = await db.rpc("studio_urgent_push_done", { p_ids: ids });
      if (error) throw new Error(`studio_urgent_push_done: ${error.message}`);
    },
  };
}

function parseSubs(v: unknown): UrgentDue["subs"] {
  if (!Array.isArray(v)) return [];
  const out: UrgentDue["subs"] = [];
  for (const s of v) {
    if (typeof s !== "object" || s === null) continue;
    const o = s as Record<string, unknown>;
    if (
      typeof o.endpoint === "string" &&
      typeof o.p256dh === "string" &&
      typeof o.auth === "string"
    )
      out.push({ endpoint: o.endpoint, p256dh: o.p256dh, auth: o.auth });
  }
  return out;
}
