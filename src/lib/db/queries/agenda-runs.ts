import "server-only";
import { z } from "zod";
import type { SourceStatus as RunStatus } from "@/lib/agenda/collect";
import { REJECT_REASONS, type RejectReason } from "@/lib/agenda/types";
import { ok, type Result } from "@/lib/result";
import { many } from "./run";
import { readAdmin } from "./sources-admin";
import type { QueryError } from "./types";

/**
 * Execuções da coleta da Agenda por fonte (`agenda_collect_runs` com `source_id`, AGM-T6): abas
 * Coleta e Recusas do Painel de Fontes. A tabela não tem política para `authenticated`: lida com
 * service role depois da checagem de `source.manage` (`readAdmin`).
 */

/** Linhas lidas para as abas (as 10 últimas execuções da fonte). */
export const AGENDA_RUNS_LIMIT = 10;

export interface AgendaSourceRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: "cron" | "manual";
  /** Situação da fonte na execução; `null` quando o registro não diz. */
  status: RunStatus | null;
  detail: string | null;
  found: number;
  approved: number;
  /** Total de recusas (somando os motivos). */
  rejected: number;
  confirmed: number;
  created: number;
  updated: number;
  aiPages: number;
}

export interface AgendaRejection {
  url: string;
  reason: RejectReason;
  /** Início da execução mais recente que recusou esta página por este motivo. */
  at: string;
}

const STATUSES = ["ok", "robots", "indisponivel", "erro", "ia_adiada", "adiada"] as const;
const count = z.number().int().nonnegative().catch(0);
const statsSchema = z
  .object({
    status: z.enum(STATUSES).nullable().catch(null),
    detail: z.string().nullable().catch(null),
    found: count,
    approved: count,
    rejected: z.record(z.string(), z.number()).catch({}),
    confirmed: count,
    new: count,
    updated: count,
    rejectedSamples: z.array(z.unknown()).catch([]),
  })
  .partial()
  .catch({});
const sampleSchema = z.object({ url: z.string(), reason: z.enum(REJECT_REASONS) });

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  trigger: string;
  ai_pages: number;
  stats: unknown;
}

export function runFromRow(r: RunRow): AgendaSourceRun {
  const s = statsSchema.parse(r.stats);
  return {
    id: r.id,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    trigger: r.trigger === "manual" ? "manual" : "cron",
    status: s.status ?? null,
    detail: s.detail ?? null,
    found: s.found ?? 0,
    approved: s.approved ?? 0,
    rejected: Object.values(s.rejected ?? {}).reduce((n, v) => n + (v > 0 ? v : 0), 0),
    confirmed: s.confirmed ?? 0,
    created: s.new ?? 0,
    updated: s.updated ?? 0,
    aiPages: r.ai_pages,
  };
}

/**
 * Recusas das execuções (`stats.rejectedSamples`, até 10 por execução), da mais recente para a
 * mais antiga, sem repetir a mesma página pelo mesmo motivo. Motivo desconhecido é descartado.
 */
export function rejectionsFromRuns(rows: readonly RunRow[]): AgendaRejection[] {
  const sorted = [...rows].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const seen = new Set<string>();
  const out: AgendaRejection[] = [];
  for (const r of sorted) {
    for (const raw of statsSchema.parse(r.stats).rejectedSamples ?? []) {
      const sample = sampleSchema.safeParse(raw);
      if (!sample.success) continue;
      const key = `${sample.data.reason} ${sample.data.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...sample.data, at: r.started_at });
    }
  }
  return out;
}

const COLUMNS = "id, started_at, finished_at, trigger, ai_pages, stats";

async function lastRuns(sourceId: string): Promise<Result<RunRow[], QueryError>> {
  return readAdmin(async (c) =>
    many(
      await c
        .svc()
        .from("agenda_collect_runs")
        .select(COLUMNS)
        .eq("source_id", sourceId)
        .order("started_at", { ascending: false })
        .limit(AGENDA_RUNS_LIMIT),
    ),
  );
}

/** As 10 últimas execuções da coleta da Agenda para esta fonte. */
export async function agendaSourceRuns(
  sourceId: string,
): Promise<Result<AgendaSourceRun[], QueryError>> {
  const rows = await lastRuns(sourceId);
  return rows.ok ? ok(rows.value.map(runFromRow)) : rows;
}

/** Recusas das 10 últimas execuções desta fonte, com o motivo. */
export async function agendaRejections(
  sourceId: string,
): Promise<Result<AgendaRejection[], QueryError>> {
  const rows = await lastRuns(sourceId);
  return rows.ok ? ok(rejectionsFromRuns(rows.value)) : rows;
}
