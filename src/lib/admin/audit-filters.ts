import type { AuditFilters } from "@/lib/db/queries/admin";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 120) || undefined;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface AuditFilterParams {
  ator?: string;
  acao?: string;
  objeto?: string;
  de?: string;
  ate?: string;
}

/** `?ator=&acao=&objeto=&de=&ate=&pagina=` → filtros da consulta, valores do formulário e página. */
export function auditFiltersFrom(sp: Params): {
  filters: AuditFilters;
  values: AuditFilterParams;
  page: number;
} {
  const values: AuditFilterParams = {
    ator: one(sp.ator),
    acao: one(sp.acao),
    objeto: one(sp.objeto),
    de: DAY.test(one(sp.de) ?? "") ? one(sp.de) : undefined,
    ate: DAY.test(one(sp.ate) ?? "") ? one(sp.ate) : undefined,
  };
  const raw = Number(one(sp.pagina));
  const page = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 1000) : 1;
  return {
    filters: {
      actor: values.ator,
      action: values.acao,
      object: values.objeto,
      from: values.de,
      to: values.ate,
    },
    values,
    page,
  };
}

/** Querystring com os filtros atuais (e a página, quando maior que 1). */
export function auditQueryString(values: AuditFilterParams, page: number): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) if (v) q.set(k, v);
  if (page > 1) q.set("pagina", String(page));
  const s = q.toString();
  return s ? `?${s}` : "";
}
