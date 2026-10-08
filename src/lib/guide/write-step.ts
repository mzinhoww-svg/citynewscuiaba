/**
 * Etapa do texto das listas (A-214): para cada lista publicada cujo texto foi escrito pelo Guia
 * (ou ainda não tem texto) e cujos lugares mudaram desde a última escrita, escreve o texto de
 * abertura e os comentários, grava e invalida as páginas. Texto do editor nunca é reescrito.
 */
import { categoryBySlug } from "./categories";
import {
  articleSignature,
  type ArticleInput,
  type ArticleVenue,
  type ListArticle,
  type WriteResult,
} from "./article";
import { guideTags } from "./tags";
import type { Venue } from "./types";

export interface ArticleList {
  id: string;
  slug: string;
  title: string;
  category: string;
  hasIntro: boolean;
  introAuto: boolean;
  signature: string | null;
  /** Rodadas seguidas em que o texto do modelo foi reprovado (zera ao gravar). */
  attempts: number;
  /** Problemas da última rodada reprovada (pedidos como correção na próxima). */
  problems: string[];
  items: { position: number; venue: Venue }[];
}

/** Na 3ª rodada reprovada vale o texto montado com os dados: nenhuma lista espera para sempre. */
export const MAX_ARTICLE_ROUNDS = 3;

export interface WriteStepDeps {
  published: () => Promise<ArticleList[]>;
  write: (
    input: ArticleInput,
    opts: { fallback: boolean; previous: readonly string[] },
  ) => Promise<WriteResult>;
  /** Rodada reprovada: guarda a contagem e os problemas para a próxima. */
  failed: (listId: string, attempts: number, problems: string[]) => Promise<void>;
  save: (
    listId: string,
    article: { intro: string; notes: Record<string, string>; signature: string },
  ) => Promise<void>;
  revalidate: (tags: string[]) => Promise<void>;
}

export type WriteOutcome =
  | { slug: string; source: ListArticle["source"]; problems: number }
  | { slug: string; source: "retry"; problems: number; round: number };

/** Lista que precisa de texto: sem texto ou com texto do Guia, e lugares diferentes da última vez. */
export function needsArticle(l: ArticleList): boolean {
  if (l.items.length === 0) return false;
  if (l.hasIntro && !l.introAuto) return false;
  return l.signature !== signatureOf(l);
}

const signatureOf = (l: ArticleList) =>
  articleSignature([...l.items].sort((a, b) => a.position - b.position).map((i) => i.venue.id));

export function articleVenue(position: number, v: Venue): ArticleVenue {
  return {
    id: v.id,
    position,
    name: v.name,
    neighborhood: v.neighborhood,
    rating: v.rating,
    ratingCount: v.ratingCount,
    ratingSource: v.ratingSource,
    priceLevel: v.priceLevel,
  };
}

/** Escreve até `limit` textos por chamada (cada um é uma chamada de modelo). */
export async function writeDueArticles(deps: WriteStepDeps, limit = 3): Promise<WriteOutcome[]> {
  const due = (await deps.published()).filter(needsArticle).slice(0, limit);
  const out: WriteOutcome[] = [];
  for (const l of due) {
    const items = [...l.items].sort((a, b) => a.position - b.position);
    const round = l.attempts + 1;
    const a = await deps.write(
      {
        title: l.title,
        noun: categoryBySlug(l.category)?.noun ?? "lugares",
        venues: items.map((i) => articleVenue(i.position, i.venue)),
      },
      { fallback: round >= MAX_ARTICLE_ROUNDS, previous: l.problems },
    );
    if ("failed" in a) {
      await deps.failed(l.id, round, a.problems);
      out.push({ slug: l.slug, source: "retry", problems: a.problems.length, round });
      continue;
    }
    await deps.save(l.id, { intro: a.intro, notes: a.notes, signature: signatureOf(l) });
    await deps.revalidate([
      guideTags.index,
      guideTags.list(l.slug),
      ...items.map((i) => guideTags.venue(i.venue.slug)),
    ]);
    out.push({ slug: l.slug, source: a.source, problems: a.problems.length });
  }
  return out;
}
