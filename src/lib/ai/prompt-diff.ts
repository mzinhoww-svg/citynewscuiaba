import { diffText, type DiffOp } from "@/lib/studio/diff";

/** Tamanho máximo do texto de um prompt (o corpo vai ao modelo como instrução de sistema). */
export const PROMPT_MAX_CHARS = 8000;

/**
 * Diferença por palavra entre dois textos de prompt (acrescentado, removido, igual). Reusa o
 * `diffText` do Estúdio (P4): o prompt é texto de equipe, sempre exibido como texto.
 */
export function diffPrompt(a: string, b: string): DiffOp[] {
  return diffText(a, b);
}

/** Houve mudança de conteúdo (ignora só diferenças de fim de linha). */
export function promptChanged(a: string, b: string): boolean {
  return normalizePromptBody(a) !== normalizePromptBody(b);
}

/** Corpo aparado, com fim de linha `\n`. */
export function normalizePromptBody(body: string): string {
  return body.replace(/\r\n?/g, "\n").trim();
}
