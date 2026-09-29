import type { SourceFilters, SourceSort } from "@/lib/db/queries/sources-admin";

/*
 * Endereço da lista de fontes (O03). O estado da lista mora na URL (filtros, ordem e página) e
 * usa os nomes que `parseSourceFilters` lê. Padrões (ordem por nome, crescente, página 1, sem
 * arquivadas) não entram no endereço.
 */

export const LIST_PATH = "/estudio/control/fontes";

export function listSearchParams(f: SourceFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.status.length > 0) p.set("status", f.status.join(","));
  if (f.layer.length > 0) p.set("camada", f.layer.join(","));
  if (f.category) p.set("editoria", f.category);
  if (f.locality) p.set("localidade", f.locality);
  if (f.reliability) p.set("confiabilidade", f.reliability);
  if (f.via) p.set("via", f.via);
  if (f.health) p.set("saude", f.health);
  if (f.archived !== "no") p.set("arquivadas", f.archived);
  if (f.sort !== "name") p.set("ordem", f.sort);
  if (f.dir !== "asc") p.set("dir", f.dir);
  if (f.page > 1) p.set("pagina", String(f.page));
  return p;
}

export function listHref(f: SourceFilters, over: Partial<SourceFilters> = {}): string {
  const qs = listSearchParams({ ...f, ...over }).toString();
  return qs ? `${LIST_PATH}?${qs}` : LIST_PATH;
}

/** Link do cabeçalho: coluna nova começa crescente; a mesma coluna inverte. Sempre volta à página 1. */
export function sortHref(f: SourceFilters, key: SourceSort): string {
  const dir = f.sort === key && f.dir === "asc" ? "desc" : "asc";
  return listHref(f, { sort: key, dir, page: 1 });
}

/** Quantos filtros (fora ordem e página) estão ativos. */
export function activeFilterCount(f: SourceFilters): number {
  return (
    (f.q ? 1 : 0) +
    (f.status.length > 0 ? 1 : 0) +
    (f.layer.length > 0 ? 1 : 0) +
    (f.category ? 1 : 0) +
    (f.locality ? 1 : 0) +
    (f.reliability ? 1 : 0) +
    (f.via ? 1 : 0) +
    (f.health ? 1 : 0) +
    (f.archived !== "no" ? 1 : 0)
  );
}

/** Endereço sem filtros, mantendo só a ordem. */
export function clearedHref(f: SourceFilters): string {
  return listHref(
    {
      ...f,
      q: "",
      status: [],
      layer: [],
      category: null,
      locality: null,
      reliability: null,
      via: null,
      health: null,
      archived: "no",
      page: 1,
    },
    {},
  );
}
