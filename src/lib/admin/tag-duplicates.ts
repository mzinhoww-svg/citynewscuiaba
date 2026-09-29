/*
 * Sugestão de tags duplicadas (A05). Determinística: mesma forma sem acento, caixa, pontuação e
 * plural simples. Não é IA: a sugestão por IA fica para depois (A-206); o humano decide a mescla.
 */
export interface TagLite {
  id: string;
  name: string;
  articles: number;
}

/** Forma de comparação: sem acento, minúscula, só letras e números, sem "s" final por palavra. */
export function tagKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}

export interface DuplicateGroup {
  key: string;
  /** Sugestão de destino: a tag mais usada (empate: nome mais curto, depois ordem alfabética). */
  keep: TagLite;
  others: TagLite[];
}

export function suggestDuplicates(tags: readonly TagLite[]): DuplicateGroup[] {
  const groups = new Map<string, TagLite[]>();
  for (const t of tags) {
    const key = tagKey(t.name);
    if (key === "") continue;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => {
      const sorted = [...list].sort(
        (a, b) =>
          b.articles - a.articles ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
      return { key, keep: sorted[0] as TagLite, others: sorted.slice(1) };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
