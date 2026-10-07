/**
 * Domínio do Control Center (P5): fases do ciclo, estado derivado de um run, alertas de
 * operação, máscara de IP, CSV e ordenação de tabelas. Funções puras; leitura do banco em
 * `src/lib/db/queries/control.ts`.
 */

import { canAccess, type RoleGrant } from "@/lib/auth/permissions";
import { STEP_NAMES } from "@/lib/pipeline/step-names";

// ---------------------------------------------------------------------------
// Fases do ciclo (spec §6.2: 20 etapas em 6 fases)
// ---------------------------------------------------------------------------
export const PHASES = [
  { id: "coleta", steps: ["tick", "fetch", "validate", "extract", "normalize"] },
  { id: "entendimento", steps: ["dedupe", "cluster", "classify", "locate"] },
  { id: "verificacao", steps: ["verify"] },
  { id: "redacao", steps: ["summarize", "headline"] },
  { id: "midia", steps: ["image", "image_rights"] },
  { id: "publicacao", steps: ["rules", "route", "publish", "record", "index", "notify"] },
] as const;

export type PhaseId = (typeof PHASES)[number]["id"];

export function phaseOf(step: string): PhaseId | null {
  return PHASES.find((p) => (p.steps as readonly string[]).includes(step))?.id ?? null;
}

/** Eventos de uma etapa num ciclo (`control_run_steps`). */
export interface StepStat {
  step: string;
  ok: number;
  warn: number;
  error: number;
  security: number;
  firstAt: string;
  lastAt: string;
}

export interface PhaseSpan {
  phase: PhaseId;
  /** Minutos desde o início do ciclo (1 casa). */
  startMin: number;
  durationMin: number;
  ok: number;
  /** Eventos de erro e de segurança (quarentena, injeção). */
  failed: number;
  retried: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Janela de cada fase com eventos, na ordem das fases. */
export function phaseTimeline(startedAt: string, steps: readonly StepStat[]): PhaseSpan[] {
  const t0 = Date.parse(startedAt);
  const out: PhaseSpan[] = [];
  for (const p of PHASES) {
    const mine = steps.filter((s) => (p.steps as readonly string[]).includes(s.step));
    if (mine.length === 0) continue;
    const first = Math.min(...mine.map((s) => Date.parse(s.firstAt)));
    const last = Math.max(...mine.map((s) => Date.parse(s.lastAt)));
    out.push({
      phase: p.id,
      startMin: round1(Math.max(0, first - t0) / 60_000),
      durationMin: round1(Math.max(0, last - first) / 60_000),
      ok: mine.reduce((s, x) => s + x.ok, 0),
      failed: mine.reduce((s, x) => s + x.error + x.security, 0),
      retried: mine.reduce((s, x) => s + x.warn, 0),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Estado de um ciclo
// ---------------------------------------------------------------------------
export type RunState = "running" | "partial" | "ok" | "empty" | "failed";

/**
 * O pipeline não fecha `ingest_runs.status`: o estado vem da fila e dos eventos. Mensagem do
 * ciclo na fila = em andamento; erro ou quarentena aberta = com falhas; nenhum evento = sem
 * coleta. Um status final gravado no banco (`failed`, `partial`, `ok`) prevalece.
 */
export function runStatus(r: {
  dbStatus: string;
  pending: number;
  quarantined: number;
  failed: number;
  events: number;
}): RunState {
  if (r.dbStatus === "failed" || r.dbStatus === "partial" || r.dbStatus === "ok") return r.dbStatus;
  if (r.pending > 0) return "running";
  if (r.quarantined > 0 || r.failed > 0) return "partial";
  if (r.events === 0) return "empty";
  return "ok";
}

// ---------------------------------------------------------------------------
// Alertas de operação (architecture §10)
// ---------------------------------------------------------------------------
export const ALERT_LIMITS = {
  tickLateMin: 45,
  queueBacklog: 2000,
  errorRate: 0.02,
  budgetShare: 0.9,
} as const;

export type AlertId = "tick_late" | "queue_backlog" | "error_rate" | "budget" | "source_paused";

export interface ControlAlert {
  id: AlertId;
  severity: "warn" | "critical";
  /** Valores para o texto (pt-BR em `src/content/pt-BR/control.ts`). */
  values: Record<string, string | number>;
}

export function computeAlerts(i: {
  /** Minutos desde o início do último ciclo; `null` sem nenhum ciclo. */
  tickAgeMin: number | null;
  queueTotal: number;
  errors1h: number;
  events1h: number;
  spendBrl: number;
  budgetBrl: number;
  /** Nomes das fontes pausadas automaticamente. */
  autoPaused: string[];
}): ControlAlert[] {
  const out: ControlAlert[] = [];
  if (i.tickAgeMin === null || i.tickAgeMin > ALERT_LIMITS.tickLateMin)
    out.push({ id: "tick_late", severity: "critical", values: { minutes: i.tickAgeMin ?? -1 } });
  if (i.queueTotal > ALERT_LIMITS.queueBacklog)
    out.push({ id: "queue_backlog", severity: "warn", values: { total: i.queueTotal } });
  if (i.events1h > 0 && i.errors1h / i.events1h > ALERT_LIMITS.errorRate)
    out.push({
      id: "error_rate",
      severity: "warn",
      values: { percent: Math.round((i.errors1h / i.events1h) * 1000) / 10 },
    });
  if (i.budgetBrl > 0 && i.spendBrl / i.budgetBrl > ALERT_LIMITS.budgetShare)
    out.push({
      id: "budget",
      severity: i.spendBrl >= i.budgetBrl ? "critical" : "warn",
      values: { percent: Math.round((i.spendBrl / i.budgetBrl) * 100) },
    });
  if (i.autoPaused.length > 0)
    out.push({ id: "source_paused", severity: "warn", values: { names: i.autoPaused.join(", ") } });
  return out;
}

// ---------------------------------------------------------------------------
// IP mascarado para quem não é admin (plano P5, Global Constraints)
// ---------------------------------------------------------------------------
const IPV4 = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;
const IPV6_CANDIDATE = /[0-9a-f]*(?::[0-9a-f]*){2,}/gi;

function isIpv6(s: string): boolean {
  const groups = s.split(":");
  if (!groups.every((g) => /^[0-9a-f]{0,4}$/i.test(g))) return false;
  const filled = groups.filter((g) => g !== "");
  if (filled.length < 2) return false;
  return s.includes("::") || groups.length === 8;
}

export function maskIps(text: string): string {
  return text
    .replace(IPV6_CANDIDATE, (m) => {
      if (!isIpv6(m)) return m;
      const head = m
        .split(":")
        .filter((g) => g !== "")
        .slice(0, 2);
      return `${head.join(":")}:x:x`;
    })
    .replace(IPV4, (m, a: string, b: string, c: string, d: string) =>
      [a, b, c, d].every((o) => Number(o) <= 255) ? `${a}.${b}.x.x` : m,
    );
}

export function maskIpsDeep<T>(value: T): T {
  if (typeof value === "string") return maskIps(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => maskIpsDeep(v)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, maskIpsDeep(v)]),
    ) as T;
  return value;
}

// ---------------------------------------------------------------------------
// CSV (exportação de logs)
// ---------------------------------------------------------------------------
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Planilha não executa fórmula vinda de texto externo.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Ordenação de tabelas
// ---------------------------------------------------------------------------
export type SortDir = "asc" | "desc";
export interface SortState<K extends string = string> {
  key: K;
  dir: SortDir;
}

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Ordena sem mutar; `null`/`undefined` sempre no fim. */
export function sortRows<T>(
  rows: readonly T[],
  value: (r: T) => string | number | null | undefined,
  dir: SortDir,
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
    if (y === null || y === undefined) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
    return collator.compare(String(x), String(y)) * sign;
  });
}

export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  return current.key === key
    ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
    : { key, dir: "asc" };
}

// ---------------------------------------------------------------------------
// O que cada papel faz no Control Center
// ---------------------------------------------------------------------------

/** Papéis que leem `ai_calls` (RLS `ai_calls_read_ops`). */
const COST_ROLES = new Set(["admin", "editor_chefe", "operador_ia", "analista"]);

export interface ControlAbilities {
  /** Executar agora, reprocessar e descartar falhas (`source.manage`). */
  operate: boolean;
  /** Custos de IA. */
  costs: boolean;
  /** IP sem máscara. */
  admin: boolean;
  /** Logs e exportação (`audit.view`). */
  logs: boolean;
}

export function controlAbilities(roles: readonly RoleGrant[]): ControlAbilities {
  const list = [...roles];
  return {
    operate: canAccess(list, "source.manage"),
    costs: list.some((r) => COST_ROLES.has(r.role)),
    admin: list.some((r) => r.role === "admin"),
    logs: canAccess(list, "audit.view"),
  };
}

// ---------------------------------------------------------------------------
// Filtros dos logs (O08)
// ---------------------------------------------------------------------------

/** Etapas do pipeline em que cada agente de IA roda (o registro de etapas não guarda o agente). */
export const AGENT_STEPS: Record<string, string[]> = {
  classify: ["classify"],
  locate: ["locate"],
  verify: ["verify"],
  write: ["summarize"],
  image: ["image"],
  aggregate_summary: ["classify"],
  embed: ["dedupe", "cluster", "index"],
};

export const LOG_LEVELS = ["info", "warn", "error", "security"] as const;

export interface ParsedLogFilters {
  /** Valores como vieram (válidos), para preencher o formulário e montar links. */
  form: {
    run?: string;
    item?: string;
    source?: string;
    step?: string;
    level?: string;
    agent?: string;
    q?: string;
  };
  query: {
    run?: string;
    item?: string;
    source?: string;
    steps?: string[];
    level?: string;
    q?: string;
    before?: number;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;
const REF_RE = /^(source|raw|item|topic|article):[0-9a-z-]{1,80}(#[0-9a-z_-]{1,40})?$/i;

type Params = Record<string, string | string[] | undefined>;
const first = (p: Params, k: string): string | undefined => {
  const v = p[k];
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : undefined;
};

/**
 * Lê os filtros da URL dos logs (`ciclo`, `item`, `fonte`, `etapa`, `nivel`, `agente`, `q`,
 * `antes`). Valor inválido é ignorado. Etapa e agente juntos = interseção (vazia = nenhum
 * evento).
 */
export function parseLogFilters(p: Params): ParsedLogFilters {
  const form: ParsedLogFilters["form"] = {};
  const query: ParsedLogFilters["query"] = {};
  const run = first(p, "ciclo");
  if (run && UUID_RE.test(run)) form.run = query.run = run;
  const item = first(p, "item");
  if (item && REF_RE.test(item)) form.item = query.item = item;
  const source = first(p, "fonte");
  if (source && SLUG_RE.test(source)) form.source = query.source = source;
  const level = first(p, "nivel");
  if (level && (LOG_LEVELS as readonly string[]).includes(level)) form.level = query.level = level;
  const q = first(p, "q");
  if (q) form.q = query.q = q.slice(0, 200);
  const step = first(p, "etapa");
  const agent = first(p, "agente");
  let steps: string[] | undefined;
  if (step && (STEP_NAMES as readonly string[]).includes(step)) {
    form.step = step;
    steps = [step];
  }
  if (agent && AGENT_STEPS[agent]) {
    form.agent = agent;
    const agentSteps = AGENT_STEPS[agent];
    steps = steps ? steps.filter((s) => agentSteps.includes(s)) : [...agentSteps];
    if (steps.length === 0) steps = ["__nenhuma__"];
  }
  if (steps) query.steps = steps;
  const before = Number(first(p, "antes"));
  if (Number.isInteger(before) && before > 0) query.before = before;
  return { form, query };
}

/** Query string dos filtros (sem `antes`), na ordem do formulário. */
export function logFiltersQuery(
  form: ParsedLogFilters["form"],
  extra: Record<string, string> = {},
): string {
  const keys: [keyof ParsedLogFilters["form"], string][] = [
    ["q", "q"],
    ["source", "fonte"],
    ["step", "etapa"],
    ["level", "nivel"],
    ["agent", "agente"],
    ["run", "ciclo"],
    ["item", "item"],
  ];
  const sp = new URLSearchParams();
  for (const [k, name] of keys) {
    const v = form[k];
    if (v) sp.set(name, v);
  }
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}
export * from "./costs";
