import "server-only";
import { createServerClient, createServiceClient } from "@/lib/db/client";
import { SupabaseEnvError } from "@/lib/db/env";
import { err, ok, type Result } from "@/lib/result";
import { fromRow } from "@/lib/studio-notifications/group";
import type { NotificationsSnapshot, StudioNotification } from "@/lib/studio-notifications/types";
import type { QueryError } from "./types";

/**
 * Central de notificações da equipe (BELL-T1). Todas as leituras e marcações usam o cliente com a
 * sessão da pessoa: o banco (RLS e funções `studio_*`) decide o que cabe ao papel dela.
 */

async function run<T>(fn: (db: Awaited<ReturnType<typeof createServerClient>>) => Promise<T>) {
  try {
    return ok(await fn(await createServerClient())) as Result<T, QueryError>;
  } catch (e) {
    if (e instanceof SupabaseEnvError) return err<QueryError>({ kind: "unconfigured" });
    return err<QueryError>({
      kind: "unavailable",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export const BELL_LIMIT = 30;
export const HISTORY_PAGE = 30;

export async function loadSnapshot(
  limit = BELL_LIMIT,
): Promise<Result<NotificationsSnapshot, QueryError>> {
  return run(async (db) => {
    const [list, count] = await Promise.all([
      db.rpc("studio_notifications_for", { p_limit: limit }),
      db.rpc("studio_unread_count"),
    ]);
    if (list.error) throw new Error(list.error.message);
    if (count.error) throw new Error(count.error.message);
    return { items: (list.data ?? []).map(fromRow), unread: count.data ?? 0 };
  });
}

export interface HistoryQuery {
  kind?: string | null;
  onlyUnread?: boolean;
  cursor?: string | null;
  limit?: number;
}

export interface HistoryPage {
  items: StudioNotification[];
  /** `created_at` do último item quando há mais páginas; senão `null`. */
  nextCursor: string | null;
}

export async function listHistory(q: HistoryQuery = {}): Promise<Result<HistoryPage, QueryError>> {
  const limit = q.limit ?? HISTORY_PAGE;
  return run(async (db) => {
    const { data, error } = await db.rpc("studio_notifications_for", {
      p_limit: limit + 1,
      p_cursor: q.cursor ?? null,
      p_only_unread: q.onlyUnread ?? false,
      p_kind: q.kind ?? null,
      p_history: true,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map(fromRow);
    const more = rows.length > limit;
    const items = more ? rows.slice(0, limit) : rows;
    return { items, nextCursor: more ? (items[items.length - 1]?.createdAt ?? null) : null };
  });
}

export async function markRead(ids: string[]): Promise<Result<number, QueryError>> {
  return run(async (db) => {
    const { data, error } = await db.rpc("studio_notifications_mark_read", { p_ids: ids });
    if (error) throw new Error(error.message);
    return data ?? 0;
  });
}

export async function markAllRead(): Promise<Result<number, QueryError>> {
  return run(async (db) => {
    const { data, error } = await db.rpc("studio_notifications_mark_all_read");
    if (error) throw new Error(error.message);
    return data ?? 0;
  });
}

// ---------------------------------------------------------------------------
// Cartão "Notificações push" da home e opt-in das urgências no navegador
// ---------------------------------------------------------------------------
export interface PushCardData {
  queued: number;
  pending: number;
  lastDeliveryAt: string | null;
}

/** Estado do push para a home (RLS de `push_sends` recorta pelo papel). */
export async function pushCardData(): Promise<Result<PushCardData, QueryError>> {
  return run(async (db) => {
    const count = async (statuses: string[]) => {
      const { count: n, error } = await db
        .from("push_sends")
        .select("id", { count: "exact", head: true })
        .in("status", statuses);
      if (error) throw new Error(error.message);
      return n ?? 0;
    };
    const [queued, pending, last] = await Promise.all([
      count(["scheduled", "queued", "dispatching"]),
      count(["pending_approval"]),
      db
        .from("push_sends")
        .select("finished_at")
        .eq("status", "sent")
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false })
        .limit(1),
    ]);
    if (last.error) throw new Error(last.error.message);
    return { queued, pending, lastDeliveryAt: last.data?.[0]?.finished_at ?? null };
  });
}

/** A pessoa tem alguma inscrição de push com as urgências da central ligadas? */
export async function staffAlertsOn(userId: string): Promise<boolean> {
  try {
    const { count, error } = await createServiceClient()
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("staff_alerts", true);
    return !error && (count ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Liga/desliga as urgências em todas as inscrições da própria pessoa. */
export async function setStaffAlerts(
  userId: string,
  on: boolean,
): Promise<Result<number, QueryError>> {
  try {
    const { data, error } = await createServiceClient()
      .from("push_subscriptions")
      .update({ staff_alerts: on })
      .eq("user_id", userId)
      .select("id");
    if (error) return err({ kind: "unavailable", message: error.message });
    return ok(data?.length ?? 0);
  } catch (e) {
    return err({ kind: "unavailable", message: e instanceof Error ? e.message : String(e) });
  }
}
