import { z } from "zod";
import { fold } from "@/lib/text/fold";

/** Divergência entre a fonte de descoberta e a que confirma (vence a que confirma). */
export interface EvidenceConflict {
  campo: "data" | "horario" | "local";
  /** Valor da fonte de descoberta (ISO para data e horário; nome para local). */
  descoberta: string;
  /** Local da fonte que confirma. */
  venue: string;
}

/** Trecho que o modelo cita para sustentar cada campo e onde ele viu o ano. */
export type EvidenceFields = Partial<
  Record<
    "titulo" | "data" | "horario" | "local" | "cidade" | "preco" | "organizador" | "faixa",
    { trecho: string; ano: "corpo" | "url" | "ausente" }
  >
>;

/** Evidência de um evento: trechos por campo e, se houve, a divergência com quem confirma. */
export type EvidenceRecord = EvidenceFields & { conflito?: EvidenceConflict };

/** Forma de comparação: sem diacríticos, minúsculas, espaços colapsados. */
function squash(s: string): string {
  return fold(s).replace(/\s+/g, " ").trim();
}

/**
 * `true` se o trecho citado pelo modelo existe na página (comparação sem caixa, acento nem
 * diferença de espaço). Vale contra o texto já saneado, o mesmo que foi ao modelo.
 */
export function verifyEvidence(pageText: string, trecho: string): boolean {
  const needle = squash(trecho);
  if (!needle) return false;
  return squash(pageText).includes(needle);
}

const evidenceField = z.object({ trecho: z.string(), ano: z.enum(["corpo", "url", "ausente"]) });

/** `EvidenceRecord` lido do banco ou do cache (`unknown`) é conferido antes de usar. */
export const evidenceRecordSchema = z.object({
  titulo: evidenceField.optional(),
  data: evidenceField.optional(),
  horario: evidenceField.optional(),
  local: evidenceField.optional(),
  cidade: evidenceField.optional(),
  preco: evidenceField.optional(),
  organizador: evidenceField.optional(),
  faixa: evidenceField.optional(),
  conflito: z
    .object({
      campo: z.enum(["data", "horario", "local"]),
      descoberta: z.string(),
      venue: z.string(),
    })
    .optional(),
});

/** Evidência guardada; ilegível vira `{}` (o evento continua, sem trechos). */
export function parseEvidence(v: unknown): EvidenceRecord {
  const r = evidenceRecordSchema.safeParse(v);
  return r.success ? r.data : {};
}
