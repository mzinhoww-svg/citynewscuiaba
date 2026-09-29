import type { SourceHealthKey, StepAgg } from "./monitor";

/** Formas que as telas de monitoramento recebem (sem nada do banco). */

export interface QueueRow {
  queue: string;
  step: string;
  total: number;
  ready: number;
  retrying: number;
  oldestAt: string | null;
  maxReads: number;
}

export interface SourceHealthRow {
  slug: string;
  name: string;
  kind: string;
  status: "active" | "paused" | "degraded" | "blocked";
  frequencyMinutes: number;
  lastFetchedAt: string | null;
  lastError: string | null;
  fetchOk: number;
  fetchTotal: number;
  consecutiveFailures: number;
  items24h: number;
  state: SourceHealthKey;
}

export interface RunRow {
  id: string;
  windowStart: string;
  startedAt: string;
  status: "running" | "ok" | "partial" | "failed";
  manual: boolean;
  events: number;
  errors: number;
  warns: number;
  lastEventAt: string | null;
  pending: number;
  costBrl: number;
  durationMs: number;
}

export interface EventRow {
  id: number;
  at: string;
  runId: string | null;
  step: string;
  itemRef: string | null;
  level: "info" | "warn" | "error" | "security";
  message: string;
  details: unknown;
}

export interface QuarantineRow {
  id: number;
  queue: string;
  step: string;
  itemRef: string;
  runId: string;
  reads: number;
  error: string;
  at: string;
}

export interface RetryRow {
  id: number;
  queue: string;
  step: string;
  itemRef: string;
  reads: number;
  error: string;
  retryAt: string;
}

export interface OverviewNumbers {
  events1h: number;
  errors1h: number;
  security24h: number;
  cost24hBrl: number;
  aiCalls24h: number;
  aiFailed24h: number;
}

/** Tudo que a visão geral e o tempo real mostram; também é o corpo do polling de 5 s. */
export interface LiveSnapshot {
  at: string;
  lastRun: RunRow | null;
  /** Etapas do ciclo mais recente (agrupadas por nível). */
  steps: StepAgg[];
  queues: QueueRow[];
  pendingTotal: number;
  late: boolean;
  ageMinutes: number | null;
  numbers: OverviewNumbers;
  quarantineOpen: number;
  sources: SourceHealthRow[];
  events: EventRow[];
}
