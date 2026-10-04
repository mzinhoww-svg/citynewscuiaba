import type { Result } from "@/lib/result";
import type { FoundLogo, LogoFailure } from "./logo-fetch";

/**
 * Rotina de logotipos das fontes (R27): quais fontes estão na vez e o laço que busca, grava e
 * registra. Sem rede e sem banco aqui: `discover` e `store` entram por parâmetro. Idempotente por
 * construção: toda tentativa deixa uma checagem, e a fonte só volta quando o prazo vence.
 */

export type LogoOrigin = "manual" | "auto";
export type LogoOutcome = "found" | "none" | "robots" | "unreachable" | "error";

export interface LogoSourceRow {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  logoPath: string | null;
  /** `manual` (enviado ou removido por uma pessoa) protege contra a busca automática. */
  logoSource: LogoOrigin | null;
  /** Última tentativa automática. */
  checkedAt: string | null;
  /** Última vez em que a busca achou e gravou um logotipo. */
  foundAt: string | null;
  outcome: LogoOutcome | null;
}

export interface LogoStore {
  listSources(): Promise<LogoSourceRow[]>;
  /** `manual` quando a fonte passou a ter logotipo de uma pessoa e nada foi gravado. */
  saveLogo(row: LogoSourceRow, found: FoundLogo): Promise<"saved" | "manual" | "error">;
  recordCheck(id: string, outcome: LogoOutcome, detail: string, found: boolean): Promise<void>;
}

const DAY_MS = 86_400_000;
/** Sem logotipo: tenta de novo a cada 7 dias (1 dia se o site estava fora do ar). */
export const RETRY_DAYS = 7;
export const RETRY_UNREACHABLE_DAYS = 1;
/** Logotipo automático é conferido de novo depois de 30 dias. */
export const REFRESH_DAYS = 30;
export const DEFAULT_LIMIT = 3;
export const DEFAULT_BUDGET_MS = 40_000;

const age = (iso: string | null, now: Date): number =>
  iso === null ? Number.POSITIVE_INFINITY : (now.getTime() - Date.parse(iso)) / DAY_MS;

function isDue(r: LogoSourceRow, now: Date): boolean {
  if (r.logoSource === "manual") return false;
  const sinceCheck = age(r.checkedAt, now);
  if (!r.logoPath) {
    return sinceCheck >= (r.outcome === "unreachable" ? RETRY_UNREACHABLE_DAYS : RETRY_DAYS);
  }
  return age(r.foundAt ?? r.checkedAt, now) >= REFRESH_DAYS && sinceCheck >= RETRY_DAYS;
}

/** Fontes na vez: sem logotipo primeiro (nunca checadas, depois a checagem mais antiga), renovações por último. */
export function dueSources(rows: LogoSourceRow[], now: Date): LogoSourceRow[] {
  return rows
    .filter((r) => isDue(r, now))
    .sort((a, b) => {
      const rank = (r: LogoSourceRow) => (r.logoPath ? 1 : 0);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return age(b.checkedAt, now) - age(a.checkedAt, now) || a.slug.localeCompare(b.slug);
    });
}

export type SyncOutcome = LogoOutcome | "skipped_manual";

export interface SyncItem {
  id: string;
  slug: string;
  name: string;
  outcome: SyncOutcome;
  origin?: string;
  kind?: string;
  detail?: string;
}

export interface SyncReport {
  processed: SyncItem[];
  /** Fontes ainda na vez depois desta chamada. */
  pending: number;
}

export interface SyncOptions {
  limit?: number;
  /** Uma fonte só, ignorando o prazo (botão "Buscar logo"); `manual` continua protegida. */
  sourceId?: string;
  /** Descobre e relata, sem gravar nem registrar. */
  dry?: boolean;
  /** Só com `dry`: pula as primeiras fontes da fila (o ensaio não registra tentativa, então a fila não anda sozinha). */
  skip?: number;
  budgetMs?: number;
}

export interface SyncDeps {
  store: LogoStore;
  discover: (baseUrl: string) => Promise<Result<FoundLogo, LogoFailure>>;
  now: () => Date;
}

const OUTCOME_OF: Record<LogoFailure["reason"], LogoOutcome> = {
  robots: "robots",
  page_unreachable: "unreachable",
  no_logo: "none",
};

export async function syncSourceLogos(deps: SyncDeps, opts: SyncOptions = {}): Promise<SyncReport> {
  const started = deps.now().getTime();
  const rows = await deps.store.listSources();
  const due = opts.sourceId
    ? rows.filter((r) => r.id === opts.sourceId)
    : dueSources(rows, deps.now());
  const queue = opts.dry && opts.skip ? due.slice(opts.skip) : due;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;

  const processed: SyncItem[] = [];
  for (const row of queue) {
    if (processed.length >= limit || deps.now().getTime() - started >= budget) break;
    const base = { id: row.id, slug: row.slug, name: row.name };
    if (row.logoSource === "manual") {
      processed.push({ ...base, outcome: "skipped_manual" });
      continue;
    }
    let outcome: LogoOutcome;
    let item: SyncItem;
    let found: FoundLogo | null = null;
    try {
      const r = await deps.discover(row.baseUrl);
      if (r.ok) {
        found = r.value;
        outcome = "found";
        item = { ...base, outcome, origin: r.value.originUrl, kind: r.value.kind };
      } else {
        outcome = OUTCOME_OF[r.error.reason];
        const last = r.error.attempts.at(-1);
        item = {
          ...base,
          outcome,
          detail: last ? `${last.kind}: ${last.result}` : r.error.reason,
        };
      }
    } catch (e) {
      outcome = "error";
      item = { ...base, outcome, detail: e instanceof Error ? e.message : String(e) };
    }
    if (found && !opts.dry) {
      const saved = await deps.store.saveLogo(row, found);
      if (saved === "manual") item = { ...base, outcome: "skipped_manual" };
      else if (saved === "error") {
        outcome = "error";
        item = { ...base, outcome, detail: "falha ao gravar no Storage" };
        found = null;
      }
    }
    if (!opts.dry && item.outcome !== "skipped_manual") {
      await deps.store.recordCheck(
        row.id,
        outcome,
        item.detail ?? item.origin ?? "",
        found !== null,
      );
    }
    processed.push(item);
  }
  const done = new Set(processed.map((p) => p.id));
  const pending = opts.sourceId ? 0 : queue.filter((r) => !done.has(r.id)).length;
  return { processed, pending };
}
