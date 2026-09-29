import "server-only";
import { getSession } from "@/lib/auth/require-role";
import { createServerClient } from "@/lib/db/client";
import { SupabaseEnvError } from "@/lib/db/env";
import {
  FUNNEL_STAGES,
  funnelRange,
  funnelRows,
  funnelSummary,
  SIDE_STAGES,
  type FunnelFilter,
  type FunnelRow,
  type SideStage,
} from "@/lib/push/funnel";
import { err, ok, type Result } from "@/lib/result";
import type { QueryError } from "./types";

/**
 * Funil do app (spec §10.6): `push_funnel` (0042, `security definer`, confere `push.metrics`)
 * soma os dias fechados da tabela diária e o dia corrente ao vivo; `push_active_by_browser`
 * conta o cadastro do serviço. Só contagens: nada aqui identifica uma pessoa.
 */

export interface FunnelData {
  range: { from: string; to: string; days: number };
  rows: FunnelRow[];
  side: Record<SideStage, number>;
  summary: string;
  activeByBrowser: { browser: string; n: number }[];
  /** Tudo zero no período (estado vazio). */
  empty: boolean;
}

export async function funnelData(
  f: FunnelFilter,
  today = new Date(),
): Promise<Result<FunnelData, QueryError>> {
  const range = funnelRange(f, today);
  try {
    const session = await getSession();
    if (!session) return err({ kind: "unavailable", message: "sem sessão" });
    const db = await createServerClient();
    const [funnel, active] = await Promise.all([
      db.rpc("push_funnel", {
        p_from: range.from,
        p_to: range.to,
        ...(f.device ? { p_device: f.device } : {}),
        ...(f.browser ? { p_browser: f.browser } : {}),
      }),
      db.rpc("push_active_by_browser"),
    ]);
    if (funnel.error) throw new Error(funnel.error.message);
    if (active.error) throw new Error(active.error.message);
    const counts: Record<string, number> = {};
    for (const r of funnel.data ?? []) counts[r.stage] = Number(r.n);
    const rows = funnelRows(counts);
    const side = Object.fromEntries(SIDE_STAGES.map((s) => [s, counts[s] ?? 0])) as Record<
      SideStage,
      number
    >;
    const empty =
      FUNNEL_STAGES.every((s) => (counts[s] ?? 0) === 0) && SIDE_STAGES.every((s) => side[s] === 0);
    return ok({
      range,
      rows,
      side,
      summary: funnelSummary(rows, range.days),
      activeByBrowser: (active.data ?? []).map((r) => ({ browser: r.browser, n: Number(r.n) })),
      empty,
    });
  } catch (e) {
    if (e instanceof SupabaseEnvError) return err({ kind: "unconfigured" });
    return err({ kind: "unavailable", message: e instanceof Error ? e.message : String(e) });
  }
}
