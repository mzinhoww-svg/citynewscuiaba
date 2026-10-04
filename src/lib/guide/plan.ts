import { CATEGORIES } from "./categories";

/**
 * Plano da coleta de lugares: a cada execução cuida das categorias com a sincronização mais
 * antiga (`lastSynced`), de modo que todas passam por uma volta por semana, sem uma execução
 * longa que estoure o tempo da rota. Função pura.
 */

export interface SyncTarget {
  category: string;
  subcategory: string | null;
}

export const targetKey = (t: SyncTarget) => `${t.category}:${t.subcategory ?? ""}`;

/** Alvos padrão: todas as categorias, mais as cozinhas que algum modelo ativo usa. */
export function allTargets(templates: readonly SyncTarget[]): SyncTarget[] {
  const out = new Map<string, SyncTarget>();
  for (const c of CATEGORIES)
    out.set(targetKey({ category: c.slug, subcategory: null }), {
      category: c.slug,
      subcategory: null,
    });
  for (const t of templates) {
    if (t.subcategory) out.set(targetKey(t), { category: t.category, subcategory: t.subcategory });
  }
  return [...out.values()];
}

/** Os `n` alvos mais antigos (nunca sincronizados primeiro; empate pela ordem do catálogo). */
export function pickTargets(
  targets: readonly SyncTarget[],
  lastSynced: ReadonlyMap<string, string>,
  n: number,
): SyncTarget[] {
  return targets
    .map((t, i) => ({ t, i, at: lastSynced.get(targetKey(t)) ?? "" }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.i - b.i)
    .slice(0, Math.max(0, Math.floor(n)))
    .map((x) => x.t);
}
