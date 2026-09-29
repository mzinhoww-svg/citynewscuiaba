import type { LogFilters } from "@/lib/db/queries/control";

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.slice(0, 200) || undefined;

/** `?ciclo=&item=&fonte=&etapa=&nivel=&agente=&q=&ordem=asc` → filtros da consulta. */
export function logFiltersFrom(sp: Params): { filters: LogFilters; order: "asc" | "desc" } {
  const filters: LogFilters = {};
  const map: [keyof LogFilters, string][] = [
    ["run", "ciclo"],
    ["item", "item"],
    ["source", "fonte"],
    ["step", "etapa"],
    ["level", "nivel"],
    ["agent", "agente"],
    ["q", "q"],
  ];
  for (const [key, param] of map) {
    const v = one(sp[param]);
    if (v) filters[key] = v;
  }
  return { filters, order: one(sp.ordem) === "asc" ? "asc" : "desc" };
}
