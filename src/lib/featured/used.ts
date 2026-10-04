/**
 * Registro de "já exibidos" de uma renderização da home (R40 do dono). Cada módulo, na ordem em
 * que aparece, pede ao registro só o que ainda não saiu em outro lugar da página; o módulo que
 * ficar sem item novo some em vez de repetir.
 */
export interface UsedRef {
  id: string;
  topicId?: string | null;
}

export interface Used {
  hasArticle(id: string): boolean;
  hasTopic(id: string): boolean;
  /** Marca a matéria (e o assunto dela) como exibida. */
  add(a: UsedRef): void;
  /** Até `n` matérias novas, na ordem dada, que passam em `accept`; as escolhidas ficam registradas. */
  takeArticles<T extends UsedRef>(list: readonly T[], n: number, accept?: (a: T) => boolean): T[];
  /**
   * Até `n` assuntos novos cuja matéria de capa (`cover`) ainda não saiu e que ainda não saíram;
   * assunto sem capa (`null`) fica de fora. Os escolhidos registram a matéria de capa e o assunto.
   */
  takeTopics<T extends { id: string }>(
    list: readonly T[],
    n: number,
    coverOf: (t: T) => UsedRef | null | undefined,
  ): T[];
}

export function createUsed(): Used {
  const articles = new Set<string>();
  const topics = new Set<string>();
  const used: Used = {
    hasArticle: (id) => articles.has(id),
    hasTopic: (id) => topics.has(id),
    add(a) {
      articles.add(a.id);
      if (a.topicId) topics.add(a.topicId);
    },
    takeArticles(list, n, accept) {
      const out: (typeof list)[number][] = [];
      for (const a of list) {
        if (out.length >= n) break;
        if (articles.has(a.id) || (accept && !accept(a))) continue;
        used.add(a);
        out.push(a);
      }
      return out;
    },
    takeTopics(list, n, coverOf) {
      const out: (typeof list)[number][] = [];
      for (const t of list) {
        if (out.length >= n) break;
        const cover = coverOf(t);
        if (!cover || topics.has(t.id) || articles.has(cover.id)) continue;
        if (cover.topicId && topics.has(cover.topicId)) continue;
        used.add({ id: cover.id, topicId: cover.topicId ?? t.id });
        topics.add(t.id);
        out.push(t);
      }
      return out;
    },
  };
  return used;
}
