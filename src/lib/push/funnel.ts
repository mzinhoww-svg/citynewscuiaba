/**
 * Funil do app (spec 2026-09-28 §9.3, §10.6): etapas, conversão (etapa ÷ anterior), maior perda
 * e resumo textual por regra. Funções puras; os números vêm de `push_funnel` (0042).
 */
import type { BrowserFamily, DeviceClass } from "./types";

export const FUNNEL_STAGES = [
  "install_prompt_shown",
  "app_installed",
  "notif_preprompt_shown",
  "notif_permission_granted",
  "sent_measurable",
  "delivered",
  "clicked",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** Etapas auxiliares (fora da conversão). */
export const SIDE_STAGES = ["out_install", "out_permission", "denied", "sent_total"] as const;
export type SideStage = (typeof SIDE_STAGES)[number];

export interface FunnelRow {
  stage: FunnelStage;
  n: number;
  /** Conversão em % sobre a etapa anterior (1 casa); `null` na primeira ou com anterior zero. */
  pctOfPrevious: number | null;
}

export const STAGE_LABEL: Record<FunnelStage, string> = {
  install_prompt_shown: "Convite de instalação",
  app_installed: "Instalação",
  notif_preprompt_shown: "Pré-prompt de avisos",
  notif_permission_granted: "Permissão concedida",
  sent_measurable: "Enviados (com métricas)",
  delivered: "Recebidos",
  clicked: "Tocados",
};

/** Nome curto para a frase da maior perda ("entre o pré-prompt e a permissão"). */
const SHORT: Record<FunnelStage, string> = {
  install_prompt_shown: "o convite de instalação",
  app_installed: "a instalação",
  notif_preprompt_shown: "o pré-prompt",
  notif_permission_granted: "a permissão",
  sent_measurable: "o envio",
  delivered: "o recebimento",
  clicked: "o toque",
};

const round1 = (v: number) => Math.round(v * 10) / 10;

export function funnelRows(counts: Record<string, number>): FunnelRow[] {
  let prev: number | null = null;
  return FUNNEL_STAGES.map((stage) => {
    const n = Math.max(0, Math.floor(counts[stage] ?? 0));
    const pct = prev === null || prev === 0 ? null : round1((n / prev) * 100);
    prev = n;
    return { stage, n, pctOfPrevious: pct };
  });
}

/**
 * Maior perda entre etapas consecutivas a partir do pré-prompt (a conversão da instalação já
 * abre o resumo). `null` sem duas etapas com base maior que zero.
 */
export function biggestDrop(
  rows: FunnelRow[],
): { from: FunnelStage; to: FunnelStage; pct: number } | null {
  let best: { from: FunnelStage; to: FunnelStage; pct: number } | null = null;
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.pctOfPrevious === null) continue;
    if (best === null || r.pctOfPrevious < best.pct)
      best = { from: rows[i - 1]!.stage, to: r.stage, pct: r.pctOfPrevious };
  }
  return best;
}

/** "1 240" (milhar separado por espaço, como no resumo da spec). */
export function formatCount(n: number): string {
  const s = String(Math.max(0, Math.floor(n)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** "14,5%" · "38%" (sem decimal quando inteiro). */
export function formatPct(pct: number): string {
  const r = round1(pct);
  return `${Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",")}%`;
}

export function funnelSummary(rows: FunnelRow[], days: number): string {
  const [prompt, installed] = rows;
  if (!prompt || !installed) return "";
  const period = days === 1 ? "Em 1 dia" : `Em ${days} dias`;
  if (rows.every((r) => r.n === 0)) return `${period}, sem dados no período.`;
  const first =
    installed.pctOfPrevious === null
      ? `${period}, ${formatCount(prompt.n)} convites de instalação e ${formatCount(installed.n)} instalações.`
      : `${period}, ${formatCount(prompt.n)} convites de instalação viraram ${formatCount(installed.n)} instalações (${formatPct(installed.pctOfPrevious)}).`;
  const drop = biggestDrop(rows);
  if (!drop) return first;
  return `${first} A maior perda está entre ${SHORT[drop.from]} e ${SHORT[drop.to]} (${formatPct(drop.pct)} aceitam).`;
}

export interface FunnelFilter {
  days: 7 | 30 | 90 | null;
  /** Período personalizado (YYYY-MM-DD), só quando `days` é `null`. */
  from?: string;
  to?: string;
  device?: DeviceClass;
  browser?: BrowserFamily;
}

const DEVICES: readonly DeviceClass[] = ["mobile", "tablet", "desktop"];
const BROWSERS: readonly BrowserFamily[] = [
  "chrome",
  "safari",
  "firefox",
  "edge",
  "samsung",
  "other",
];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Filtros da URL (`periodo`, `de`, `ate`, `aparelho`, `navegador`); inválidos ignorados. */
export function parseFunnelFilter(sp: URLSearchParams, today = new Date()): FunnelFilter {
  const out: FunnelFilter = { days: 30 };
  const periodo = sp.get("periodo");
  if (periodo === "7" || periodo === "30" || periodo === "90")
    out.days = Number(periodo) as 7 | 30 | 90;
  else if (periodo === "personalizado") {
    const from = sp.get("de") ?? "";
    const to = sp.get("ate") ?? "";
    if (DAY.test(from) && DAY.test(to) && from <= to) {
      out.days = null;
      out.from = from;
      out.to = to;
    }
  }
  const device = sp.get("aparelho");
  if (device && (DEVICES as readonly string[]).includes(device)) out.device = device as DeviceClass;
  const browser = sp.get("navegador");
  if (browser && (BROWSERS as readonly string[]).includes(browser))
    out.browser = browser as BrowserFamily;
  void today;
  return out;
}

/** Intervalo em dias de calendário (YYYY-MM-DD, inclusivo) e quantidade de dias. */
export function funnelRange(
  f: FunnelFilter,
  today = new Date(),
): { from: string; to: string; days: number } {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (f.days === null && f.from && f.to) {
    const days = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86_400_000) + 1;
    return { from: f.from, to: f.to, days };
  }
  const days = f.days ?? 30;
  const to = iso(today);
  const from = iso(new Date(today.getTime() - (days - 1) * 86_400_000));
  return { from, to, days };
}
