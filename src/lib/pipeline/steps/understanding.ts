import type { CollectedItemRecord } from "../ports";
import { createHash } from "node:crypto";
import type { AiError } from "@/lib/ai/types";
import { stepError, type StepError } from "../run-step";

const ITEM_REF = /^item:([^\s]+)$/;

/** Id do item de uma referência `item:<id>`. */
export function itemIdFrom(ref: string): string | null {
  return ITEM_REF.exec(ref)?.[1] ?? null;
}

/** Janela de agrupamento e de busca de duplicados (spec §6.2, plano P3 Global Constraints). */
export const TOPIC_WINDOW_HOURS = 72;

export const windowSince = (now: Date): Date =>
  new Date(now.getTime() - TOPIC_WINDOW_HOURS * 3600_000);

/** Texto usado para o embedding do item: título e linha de apoio. */
export const itemText = (item: Pick<CollectedItemRecord, "title" | "excerpt">): string =>
  item.excerpt ? `${item.title}\n${item.excerpt}` : item.title;

/** Hash da entrada de uma decisão (idempotência por item/assunto, versão do prompt e texto). */
export const inputHash = (...parts: (string | number | null)[]): string =>
  createHash("sha256").update(parts.map(String).join("\u0000"), "utf8").digest("hex");

export const INJECTION_MESSAGE = "instrução embutida em texto externo";

/**
 * Erro de IA → erro de etapa. Injeção vai para a quarentena com alerta; o resto (tempo, provedor,
 * schema, orçamento, IA desligada) é transitório: nova tentativa e, esgotadas, quarentena
 * reprocessável.
 */
export function aiStepError(
  e: AiError,
  what: string,
  details: Record<string, unknown> = {},
): StepError {
  if (e === "injection") return stepError.injection(INJECTION_MESSAGE, { ...details, ai: e });
  return stepError.transient(`${what}: IA indisponível (${e})`, { ...details, ai: e });
}
