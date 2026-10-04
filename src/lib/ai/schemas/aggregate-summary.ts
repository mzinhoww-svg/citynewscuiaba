import { z } from "zod";
import { textTokens } from "@/lib/pipeline/text-features";

/** Tamanho máximo do resumo próprio de um item agregado (card do Panorama). */
export const AGGREGATE_SUMMARY_MAX = 280;
/** Frase do resumo que repete esta quantidade de palavras seguidas da fonte é cópia. */
export const COPY_RUN_WORDS = 8;

/** Frases do texto: termina em . ! ? ou … seguido de espaço ou fim. */
export function sentencesOf(text: string): string[] {
  return (text.trim().match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/**
 * Primeira sequência de `n` palavras seguidas (sem acento e caixa) que o resumo repete da fonte,
 * ou `null`. Vale frase a frase: nenhuma frase pode copiar `n` palavras seguidas.
 */
export function copiedRun(summary: string, source: string, n = COPY_RUN_WORDS): string | null {
  const src = textTokens(source);
  if (src.length < n) return null;
  const grams = new Set<string>();
  for (let i = 0; i + n <= src.length; i++) grams.add(src.slice(i, i + n).join(" "));
  for (const sentence of sentencesOf(summary)) {
    const t = textTokens(sentence);
    for (let i = 0; i + n <= t.length; i++) {
      const g = t.slice(i, i + n).join(" ");
      if (grams.has(g)) return g;
    }
  }
  return null;
}

/** Palavra com inicial maiúscula fora do começo da frase: nome de pessoa, lugar ou órgão. */
const PROPER = /^\p{Lu}/u;

/**
 * Tokens que são fato, não redação: números e as palavras que a fonte escreve com inicial
 * maiúscula no meio da frase (nomes de pessoas, lugares, órgãos). Já sem acento e caixa.
 */
function factTokens(source: string): Set<string> {
  const facts = new Set<string>();
  for (const sentence of sentencesOf(source)) {
    const words = sentence.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    words.forEach((w, i) => {
      if (i > 0 && PROPER.test(w)) for (const t of textTokens(w)) facts.add(t);
    });
  }
  return facts;
}

/**
 * Como `copiedRun`, mas nome próprio e número quebram a sequência: repetir "Jefferson Fátimo da
 * Silva e Claudiomar Garcia de Carvalho" ou "Penitenciária Central do Estado" é citar o fato, não
 * copiar a redação. Só `n` palavras comuns seguidas iguais às da fonte contam como cópia. Usada
 * pela matéria do `write`, que compara contra o texto inteiro da fonte.
 */
export function copiedPhrase(text: string, source: string, n = COPY_RUN_WORDS): string | null {
  const facts = factTokens(source);
  const isFact = (t: string) => facts.has(t) || /\p{N}/u.test(t);
  const plain = (gram: string[]) => !gram.some(isFact);
  const src = textTokens(source);
  if (src.length < n) return null;
  const grams = new Set<string>();
  for (let i = 0; i + n <= src.length; i++) {
    const g = src.slice(i, i + n);
    if (plain(g)) grams.add(g.join(" "));
  }
  for (const sentence of sentencesOf(text)) {
    const t = textTokens(sentence);
    for (let i = 0; i + n <= t.length; i++) {
      const g = t.slice(i, i + n);
      if (plain(g) && grams.has(g.join(" "))) return g.join(" ");
    }
  }
  return null;
}

/**
 * Agente `aggregate_summary`: resumo de até 2 frases, escrito pelo CityNews, do item de outro
 * veículo (só fontes com política `summary_2_sentences`; spec D10, CLAUDE.md regra 4).
 */
export const AggregateSummarySchema = z.object({
  summary: z
    .string()
    .trim()
    .min(20)
    .max(AGGREGATE_SUMMARY_MAX)
    .refine((s) => sentencesOf(s).length <= 2, { message: "resumo com mais de 2 frases" }),
});
export type AggregateSummary = z.infer<typeof AggregateSummarySchema>;
