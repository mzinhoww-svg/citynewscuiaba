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
