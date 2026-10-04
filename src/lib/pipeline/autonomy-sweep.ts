/**
 * Varredura de autonomia (A-134), a cada 5 min junto do revisor: nada fica parado e falha
 * recorrente vira um incidente, não dezenas de pedidos.
 *
 * 1. Disjuntor: TRIP → THROTTLE → DIAGNOSE → AUTO-RECOVER (`publish_breaker_auto_recover`).
 * 2. Matérias com próxima ação vencida: nova redação (`summarize`, `topic:<id>#retry<n>`) depois
 *    de falha da IA, ou nova decisão das regras (`rules`).
 * 3. Itens mortos (`pipeline_quarantine`): classe do erro e recomendação; o que é transitório volta
 *    à fila em 30 min, 2 h e 12 h (no máximo 3 vezes); o resto fica com a recomendação registrada.
 * 4. Incidentes: 5 ou mais falhas com a mesma assinatura (etapa + erro normalizado) na última hora
 *    viram um incidente; sem falha nova por 30 min, o incidente se resolve sozinho.
 */
import type { PipelineMessage } from "./types";

export interface DueArticle {
  id: string;
  topicId: string | null;
  nextAction: string | null;
  aiFallback: boolean;
  reprocessCount: number;
}

export interface DeadLetter {
  id: number;
  step: string;
  error: string;
  quarantinedAt: string;
  reasonClass: string | null;
  autoRetries: number;
  nextRetryAt: string | null;
}

export interface Incident {
  signature: string;
  step: string;
  errorClass: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  diagnosis: string;
  action: string;
}

export interface AutonomySweepPort {
  breakerAutoRecover(now: Date): Promise<Record<string, unknown>>;
  dueArticles(now: Date, limit: number): Promise<DueArticle[]>;
  claimArticle(id: string): Promise<void>;
  enqueue(msg: PipelineMessage): Promise<boolean>;
  openDeadLetters(limit: number): Promise<DeadLetter[]>;
  classifyDeadLetter(
    id: number,
    c: { reasonClass: string; recommendation: string; nextRetryAt: string | null },
  ): Promise<void>;
  retryDeadLetters(ids: number[]): Promise<number>;
  bumpDeadLetter(id: number, nextRetryAt: string | null): Promise<void>;
  upsertIncident(i: Incident): Promise<void>;
  resolveIncidents(quietSince: Date): Promise<number>;
}

export interface SweepResult {
  breaker: Record<string, unknown>;
  rewrites: number;
  reevaluations: number;
  deadLettersClassified: number;
  deadLettersRetried: number;
  incidents: number;
  incidentsResolved: number;
}

/** Espera entre as tentativas automáticas de um item morto transitório (min). */
export const DEAD_LETTER_RETRY_MIN = [30, 120, 720] as const;
export const INCIDENT_THRESHOLD = 5;

export type DeadLetterClass = "transient" | "invalid" | "injection" | "not_found" | "no_handler";

/** Classe e recomendação de um item morto a partir do erro registrado. */
export function classifyDeadLetter(error: string): {
  reasonClass: DeadLetterClass;
  recommendation: string;
  retryable: boolean;
} {
  const e = error.toLowerCase();
  if (/inje[cç][aã]o|injection/.test(e))
    return {
      reasonClass: "injection",
      recommendation: "texto externo com instrução embutida: manter fora e revisar a fonte",
      retryable: false,
    };
  if (/não encontrad|nao encontrad|not found|sumiu/.test(e))
    return {
      reasonClass: "not_found",
      recommendation: "referência apagada: arquivar o item",
      retryable: false,
    };
  if (/sem implementa|no handler/.test(e))
    return {
      reasonClass: "no_handler",
      recommendation: "etapa sem implementação: corrigir o código e reprocessar",
      retryable: false,
    };
  if (/inválid|invalid|referência inválida/.test(e))
    return {
      reasonClass: "invalid",
      recommendation: "entrada inválida: corrigir a origem e reprocessar a partir da etapa",
      retryable: false,
    };
  return {
    reasonClass: "transient",
    recommendation: "falha passageira (rede, banco, provedor): nova tentativa automática",
    retryable: true,
  };
}

/** Assinatura da causa: etapa + erro sem números, ids e aspas. */
export function failureSignature(step: string, error: string): string {
  const norm = error
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "<id>")
    .replace(/\d+/g, "<n>")
    .replace(/["'`].*?["'`]/g, "<s>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${step}:${norm}`;
}

/** Agrupa falhas da última hora: N falhas iguais viram um incidente (não N pedidos). */
export function groupIncidents(
  failures: DeadLetter[],
  now: Date,
  threshold = INCIDENT_THRESHOLD,
): Incident[] {
  const since = now.getTime() - 3_600_000;
  const groups = new Map<string, DeadLetter[]>();
  for (const f of failures) {
    if (Date.parse(f.quarantinedAt) < since) continue;
    const sig = failureSignature(f.step, f.error);
    groups.set(sig, [...(groups.get(sig) ?? []), f]);
  }
  const out: Incident[] = [];
  for (const [signature, list] of groups) {
    if (list.length < threshold) continue;
    const times = list.map((f) => f.quarantinedAt).sort();
    const c = classifyDeadLetter(list[0]!.error);
    out.push({
      signature,
      step: list[0]!.step,
      errorClass: c.reasonClass,
      count: list.length,
      firstSeen: times[0]!,
      lastSeen: times.at(-1)!,
      diagnosis: `${list.length} falhas com a mesma causa na etapa ${list[0]!.step} na última hora`,
      action: c.retryable
        ? "reprocessar o lote quando a causa cessar (nova tentativa automática agendada)"
        : c.recommendation,
    });
  }
  return out;
}

const addMin = (d: Date, min: number) => new Date(d.getTime() + min * 60_000).toISOString();

export async function runAutonomySweep(
  port: AutonomySweepPort,
  now: Date,
  limit = 50,
): Promise<SweepResult> {
  const result: SweepResult = {
    breaker: await port.breakerAutoRecover(now),
    rewrites: 0,
    reevaluations: 0,
    deadLettersClassified: 0,
    deadLettersRetried: 0,
    incidents: 0,
    incidentsResolved: 0,
  };
  const runId = `autonomy-${now.toISOString()}`;

  for (const a of await port.dueArticles(now, limit)) {
    await port.claimArticle(a.id);
    if ((a.aiFallback || a.nextAction === "rewrite") && a.topicId) {
      const ok = await port.enqueue({
        runId,
        step: "summarize",
        itemRef: `topic:${a.topicId}#retry${a.reprocessCount}`,
        attempt: 1,
      });
      if (ok) result.rewrites++;
    } else {
      const ok = await port.enqueue({
        runId,
        step: "rules",
        itemRef: `article:${a.id}`,
        attempt: 1,
      });
      if (ok) result.reevaluations++;
    }
  }

  const dead = await port.openDeadLetters(500);
  const retry: number[] = [];
  for (const d of dead) {
    const c = classifyDeadLetter(d.error);
    if (d.reasonClass === null) {
      const first = c.retryable ? addMin(now, DEAD_LETTER_RETRY_MIN[0]) : null;
      await port.classifyDeadLetter(d.id, { ...c, nextRetryAt: first });
      result.deadLettersClassified++;
      continue;
    }
    if (c.retryable && d.nextRetryAt && Date.parse(d.nextRetryAt) <= now.getTime()) {
      if (d.autoRetries < DEAD_LETTER_RETRY_MIN.length) retry.push(d.id);
      const next = DEAD_LETTER_RETRY_MIN[d.autoRetries + 1];
      await port.bumpDeadLetter(d.id, next === undefined ? null : addMin(now, next));
    }
  }
  if (retry.length > 0) result.deadLettersRetried = await port.retryDeadLetters(retry);

  for (const i of groupIncidents(dead, now)) {
    await port.upsertIncident(i);
    result.incidents++;
  }
  result.incidentsResolved = await port.resolveIncidents(new Date(now.getTime() - 30 * 60_000));
  return result;
}
