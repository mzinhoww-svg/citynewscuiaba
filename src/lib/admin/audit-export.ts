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
  "nome",
  "acao",
  "objeto",
  "detalhes",
  "ip_hash",
] as const;

export function auditCsv(rows: readonly AuditRow[], opts: { maskIp: boolean }): string {
  return toCsv(
    AUDIT_CSV_HEADERS,
    rows.map((r) => {
      const p = presentAuditRow(r, opts);
      return [
        p.id,
        p.at,
        p.actor,
        p.actorName ?? "",
        p.action,
        p.objectRef,
        JSON.stringify(p.details ?? {}),
        p.ipHash ?? "",
      ];
    }),
  );
}
