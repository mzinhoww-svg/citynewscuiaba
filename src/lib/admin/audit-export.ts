/**
 * Auditoria (A10): filtros da URL e exportação CSV. Para quem não é admin, todo IP nos
 * detalhes vira `a.b.x.x` (`maskIpsDeep`) e o hash do IP não sai. Puro.
 */
import { maskIpsDeep, toCsv } from "@/lib/control";

export interface AuditRow {
  id: number;
  at: string;
  actor: string;
  actorName: string | null;
  action: string;
  objectRef: string;
  details: unknown;
  ipHash: string | null;
}

export interface AuditFilters {
  actor?: string;
  action?: string;
  object?: string;
  from?: string;
  to?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseAuditFilters(
  params: Record<string, string | string[] | undefined>,
): AuditFilters {
  const one = (k: string) => {
    const v = params[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
    return s.slice(0, 120);
  };
  const out: AuditFilters = {};
  const actor = one("ator");
  const action = one("acao");
  const object = one("objeto");
  const from = one("de");
  const to = one("ate");
  if (actor) out.actor = actor;
  if (action) out.action = action;
  if (object) out.object = object;
  if (DAY.test(from)) out.from = from;
  if (DAY.test(to)) out.to = to;
  return out;
}

export function auditFiltersQuery(f: AuditFilters): string {
  const q = new URLSearchParams();
  if (f.actor) q.set("ator", f.actor);
  if (f.action) q.set("acao", f.action);
  if (f.object) q.set("objeto", f.object);
  if (f.from) q.set("de", f.from);
  if (f.to) q.set("ate", f.to);
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Linha pronta para a tela ou o CSV, já mascarada quando for o caso. */
export function presentAuditRow(row: AuditRow, opts: { maskIp: boolean }): AuditRow {
  if (!opts.maskIp) return row;
  return { ...row, details: maskIpsDeep(row.details), ipHash: null };
}

export const AUDIT_CSV_HEADERS = [
  "id",
  "quando",
  "ator",
  "acao",
  "objeto",
  "detalhes",
  "ip_hash",
] as const;

const EMAIL = /[^\s@"'<>,;]+@[^\s@"'<>,;]+\.[A-Za-z]{2,}/g;
/** Chaves de texto livre de titular (pedidos LGPD): nunca vão para o arquivo exportado. */
const FREE_TEXT_KEYS = new Set(["notes", "notas", "email", "e-mail", "nome", "name"]);

/**
 * Tira dado pessoal dos detalhes exportados: chaves de texto livre e e-mail dentro de qualquer
 * texto. Vale para todos os papéis (o CSV sai da casa; o `audit_log` é imutável e não dá para
 * apagar a pedido do titular, então o dado não pode nem sair de lá).
 */
export function redactPersonalData<T>(value: T): T {
  if (typeof value === "string") return value.replace(EMAIL, "[e-mail removido]") as T;
  if (Array.isArray(value)) return value.map((v: unknown) => redactPersonalData(v)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !FREE_TEXT_KEYS.has(k.toLowerCase()))
        .map(([k, v]) => [k, redactPersonalData(v)]),
    ) as T;
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** FNV-1a de 32 bits em hexadecimal: pseudônimo estável e sem volta para o id. */
function pseudonym(actor: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < actor.length; i++) {
    h ^= actor.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `pessoa-${h.toString(16).padStart(8, "0")}`;
}

export interface AuditCsvOptions {
  /** Quem não é admin: IP mascarado, hash oculto e ator pseudonimizado. */
  maskIp: boolean;
  /** A exportação parou neste número de linhas: o arquivo traz o aviso na última linha. */
  truncatedAt?: number;
}

export function auditCsv(rows: readonly AuditRow[], opts: AuditCsvOptions): string {
  const body = rows.map((r) => {
    const p = presentAuditRow(r, opts);
    const actor = opts.maskIp && UUID.test(p.actor) ? pseudonym(p.actor) : p.actor;
    return [
      p.id,
      p.at,
      actor,
      p.action,
      p.objectRef,
      JSON.stringify(redactPersonalData(p.details ?? {})),
      p.ipHash ?? "",
    ];
  });
  if (opts.truncatedAt !== undefined)
    body.push([
      "",
      "",
      "",
      "AVISO",
      `exportação truncada em ${opts.truncatedAt} linhas; refine os filtros para ver o restante`,
      "{}",
      "",
    ]);
  return toCsv(AUDIT_CSV_HEADERS, body);
}

/**
 * Lê a auditoria por páginas de `id` decrescente até `limit` linhas (mais uma, para saber se
 * havia mais). O PostgREST corta cada resposta em `max_rows` (1000 no config.toml), então um
 * `.limit(5000)` sozinho entregaria 1000 sem avisar (gate do P5, achado 11).
 */
export async function collectAuditRows(
  fetchPage: (o: { limit: number; before?: number }) => Promise<AuditRow[]>,
  limit: number,
  pageSize = 1000,
): Promise<{ rows: AuditRow[]; truncated: boolean }> {
  const all: AuditRow[] = [];
  let before: number | undefined;
  while (all.length < limit + 1) {
    const page = await fetchPage({
      limit: Math.min(pageSize, limit + 1 - all.length),
      ...(before !== undefined ? { before } : {}),
    });
    if (page.length === 0) break;
    all.push(...page);
    before = page[page.length - 1]!.id;
  }
  const truncated = all.length > limit;
  return { rows: truncated ? all.slice(0, limit) : all, truncated };
}
