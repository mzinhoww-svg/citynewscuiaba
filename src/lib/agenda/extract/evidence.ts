import { fold } from "@/lib/text/fold";

/** Trecho que o modelo cita para sustentar cada campo e onde ele viu o ano. */
export type EvidenceRecord = Partial<
  Record<
    "titulo" | "data" | "horario" | "local" | "cidade" | "preco" | "organizador",
    { trecho: string; ano: "corpo" | "url" | "ausente" }
  >
>;

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
