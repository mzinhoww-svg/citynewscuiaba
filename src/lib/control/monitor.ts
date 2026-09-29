import { STEP_NAMES, type StepName } from "@/lib/pipeline/types";

/*
 * Lógica pura do monitoramento (P5-T3): fases do ciclo, estado de fonte e de execução, ordenação
 * e máscara de IP nos logs. Sem banco, sem React: testável em unidade.
 */

export const PHASES = ["coleta", "analise", "redacao", "decisao", "encerramento"] as const;
export type PhaseKey = (typeof PHASES)[number];

const PHASE_STEPS: Record<PhaseKey, readonly StepName[]> = {
  coleta: ["tick", "fetch", "validate", "extract", "normalize"],
  analise: ["dedupe", "cluster", "classify", "locate", "verify"],
  redacao: ["summarize", "headline", "image", "image_rights"],
  decisao: ["rules", "route", "publish"],
  encerramento: ["record", "index", "notify"],
};

export function phaseOf(step: StepName): PhaseKey {
  for (const p of PHASES) if (PHASE_STEPS[p].includes(step)) return p;
  return "encerramento";
}

export const stepsOf = (phase: PhaseKey): readonly StepName[] => PHASE_STEPS[phase];

export const isStepName = (v: unknown): v is StepName =>
  typeof v === "string" && (STEP_NAMES as readonly string[]).includes(v);

/** Falhas seguidas que pausam a fonte (spec do painel de fontes, D-F18). */
export const AUTO_PAUSE_FAILURES = 3;

export type SourceStatus = "active" | "paused" | "degraded" | "blocked";
export type SourceHealthKey = "ok" | "degraded" | "paused" | "paused_auto" | "blocked";

/**
 * Estado mostrado na tabela de fontes. Três falhas seguidas de coleta = "Pausada (auto)", mesmo
 * que o banco ainda não tenha trocado o status: a coleta com 3 falhas seguidas não deve ser
 * lida como saudável. Bloqueada (decisão humana ou robots) prevalece.
 */
export function sourceHealthState(input: {
  status: SourceStatus;
  consecutiveFailures: number;
}): SourceHealthKey {
  if (input.status === "blocked") return "blocked";
  if (input.consecutiveFailures >= AUTO_PAUSE_FAILURES) return "paused_auto";
  if (input.status === "paused") return "paused";
  if (input.status === "degraded" || input.consecutiveFailures > 0) return "degraded";
  return "ok";
}

export type RunState = "running" | "ok" | "partial" | "failed";

/** Um run nunca é fechado pelo pipeline (`finished_at` fica nulo): o estado vem dos fatos. */
export function deriveRunState(input: {
  dbStatus: "running" | "ok" | "partial" | "failed";
  pending: number;
  errors: number;
  events: number;
  lastEventAt: string | null;
  startedAt: string;
  now: Date;
}): RunState {
  if (input.dbStatus === "failed" || input.dbStatus === "partial") return input.dbStatus;
  const last = Date.parse(input.lastEventAt ?? input.startedAt);
  const idleMin = (input.now.getTime() - (Number.isNaN(last) ? 0 : last)) / 60_000;
  if (input.dbStatus === "running" && (input.pending > 0 || idleMin < 5)) return "running";
  if (input.events === 0) return "failed";
  return input.errors > 0 ? "partial" : "ok";
}

/** Eventos de uma etapa agrupados por nível (`control_run_steps`). */
export interface StepAgg {
  step: string;
  level: string;
  count: number;
  firstAt: string;
  lastAt: string;
}

export interface PhaseSummary {
  phase: PhaseKey;
  events: number;
  errors: number;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number;
}

const isFailure = (level: string): boolean => level === "error" || level === "security";

/** Duração por fase: do primeiro ao último evento das etapas dela. */
export function phaseSummaries(rows: readonly StepAgg[]): PhaseSummary[] {
  return PHASES.map((phase) => {
    const own = rows.filter((e) => isStepName(e.step) && phaseOf(e.step) === phase);
    const firsts = own.map((e) => Date.parse(e.firstAt)).filter((t) => !Number.isNaN(t));
    const lasts = own.map((e) => Date.parse(e.lastAt)).filter((t) => !Number.isNaN(t));
    const min = firsts.length ? Math.min(...firsts) : null;
    const max = lasts.length ? Math.max(...lasts) : null;
    return {
      phase,
      events: own.reduce((n, e) => n + e.count, 0),
      errors: own.filter((e) => isFailure(e.level)).reduce((n, e) => n + e.count, 0),
      startedAt: min === null ? null : new Date(min).toISOString(),
      endedAt: max === null ? null : new Date(max).toISOString(),
      durationMs: min === null || max === null ? 0 : Math.max(0, max - min),
    };
  });
}

export interface StepCount {
  step: StepName;
  ok: number;
  warn: number;
  errors: number;
  pending: number;
}

/** Contagem por etapa, na ordem do ciclo (as 20 etapas sempre aparecem). */
export function stepCounts(
  rows: readonly StepAgg[],
  pendingByStep: Readonly<Record<string, number>>,
): StepCount[] {
  return STEP_NAMES.map((step) => {
    const own = rows.filter((r) => r.step === step);
    const sum = (f: (l: string) => boolean) =>
      own.filter((r) => f(r.level)).reduce((n, r) => n + r.count, 0);
    return {
      step,
      ok: sum((l) => l === "info"),
      warn: sum((l) => l === "warn"),
      errors: sum(isFailure),
      pending: pendingByStep[step] ?? 0,
    };
  });
}

/** "1 min 05 s", "42 s", "850 ms". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 s";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/* ---------------------------------------------------------------- ordenação */

export type SortDir = "asc" | "desc";
export interface Sort<K extends string> {
  key: K;
  dir: SortDir;
}

/** `?ordem=chave` (crescente) ou `?ordem=-chave` (decrescente); chave fora da lista → padrão. */
export function parseSort<K extends string>(
  raw: string | undefined,
  keys: readonly K[],
  fallback: Sort<K>,
): Sort<K> {
  if (!raw) return fallback;
  const dir: SortDir = raw.startsWith("-") ? "desc" : "asc";
  const key = raw.replace(/^-/, "");
  const hit = keys.find((k) => k === key);
  return hit ? { key: hit, dir } : fallback;
}

/** Valor de `?ordem=` ao clicar no cabeçalho `key`: alterna a direção da coluna ativa. */
export function nextSortParam<K extends string>(current: Sort<K>, key: K): string {
  if (current.key !== key) return key;
  return current.dir === "asc" ? `-${key}` : key;
}

export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: Sort<K>,
  value: (row: T, key: K) => string | number | null,
): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return String(x).localeCompare(String(y), "pt-BR") * sign;
  });
}

/* ------------------------------------------------------------------ máscara */

const IPV4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
// IPv6 completo (8 grupos) ou abreviado com "::"; "10:30:15" (hora) não casa.
const IPV6 =
  /(?<![0-9a-f:])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?)(?![0-9a-f:])/gi;

/** 203.0.113.42 → 203.0.x.x · 2001:db8:1:2::9 → 2001:db8:x:x. */
export function maskIps(text: string): string {
  return text
    .replace(IPV4, (_m, a: string, b: string) => `${a}.${b}.x.x`)
    .replace(IPV6, (m) => `${m.split(":").filter(Boolean).slice(0, 2).join(":")}:x:x`);
}

/**
 * O valor digitado num filtro parece um IP inteiro ou parcial (3º grupo do IPv4 em diante, ou IPv6 com 3 grupos; os 2 primeiros a tela já mostra). Quem não é
 * admin não pode filtrar por IP: o filtro roda no texto cru e revelaria o IP que a tela mascara.
 */
export function looksLikeIp(value: string): boolean {
  if ((value.match(/\d/g)?.length ?? 0) < 3) return false;
  // A tela já mostra os dois primeiros grupos ("203.0.x.x", "2001:db8:x:x"): o oráculo começa no
  // terceiro grupo, então só valem IPv4 com 3 grupos (o terceiro pode estar incompleto) e IPv6 com
  // dois `:` entre grupos hex.
  return /\d+\.\d+\.\d/.test(value) || /(^|[^0-9a-z])[0-9a-f]{1,4}:[0-9a-f]{0,4}:/i.test(value);
}

/** Só admin vê o IP inteiro (Global Constraints do P5). */
export const maskIpsFor = (text: string, isAdmin: boolean): string =>
  isAdmin ? text : maskIps(text);

export function maskJson(value: unknown, isAdmin: boolean): unknown {
  if (isAdmin) return value;
  return JSON.parse(maskIps(JSON.stringify(value ?? null))) as unknown;
}

/* ------------------------------------------------------------------ agentes */

/** Etapa em que cada agente de IA roda (os eventos do pipeline não gravam o agente). */
export const AGENT_STEPS: Record<string, readonly StepName[]> = {
  classify: ["classify"],
  locate: ["locate"],
  verify: ["verify"],
  write: ["summarize", "headline"],
  cluster: ["cluster"],
};
