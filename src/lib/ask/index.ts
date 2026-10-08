/**
 * Pergunte ao CityNews como chat (UI-T13): tipos do turno e regras puras sobre o NDJSON de
 * `/api/ask`. Pode ir para o navegador (nada de servidor aqui).
 */
import type { AiAnswer } from "@/lib/ai/answer";

/** Mesmo limite da rota `/api/ask` e do formulário simples. */
export const MAX_QUESTION = 300;
/** Contador de caracteres aparece a partir daqui. */
export const COUNTER_FROM = 250;

export type ChatStatus = "processing" | "answer" | "refused" | "error" | "rate_limited" | "off";
/** Indicador local enquanto processa: Buscando fontes → Comparando (2 s) → Escrevendo (5 s). */
export type AskStep = "sources" | "comparing" | "writing";

export interface ChatTurn {
  id: string;
  question: string;
  status: ChatStatus;
  /** Ausente em `processing` e em falha de rede (stream sem `answer`). */
  answer?: AiAnswer;
  askedAt: string;
  step?: AskStep;
  /** Limite por hora aplicado (20 sem conta, 60 com conta), para a mensagem de limite. */
  limit?: number;
}

/** Evento `answer` do NDJSON de `/api/ask`. */
export interface AnswerEvent {
  type: "answer";
  answer: AiAnswer;
  aiOff: boolean;
  limit: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Lê uma linha do NDJSON; `null` para linha vazia, inválida ou de outro tipo. */
export function parseAnswerLine(line: string): AnswerEvent | null {
  const t = line.trim();
  if (!t) return null;
  try {
    const v: unknown = JSON.parse(t);
    if (!isObj(v) || v.type !== "answer" || !isObj(v.answer)) return null;
    const kind = v.answer.kind;
    if (kind !== "answer" && kind !== "insufficient" && kind !== "error") return null;
    return {
      type: "answer",
      answer: v.answer as unknown as AiAnswer,
      aiOff: v.aiOff === true,
      limit: typeof v.limit === "number" ? v.limit : 0,
    };
  } catch {
    return null;
  }
}

/** Estado final do turno a partir do evento `answer`. */
export function statusOf(ev: AnswerEvent): Exclude<ChatStatus, "processing"> {
  if (ev.aiOff) return "off";
  if (ev.answer.kind === "answer") return "answer";
  if (ev.answer.kind === "insufficient") return "refused";
  return ev.answer.reason === "rate_limited" ? "rate_limited" : "error";
}

/** Pergunta como vai à rota: espaços nas pontas fora e no máximo 300 caracteres. */
export function cleanQuestion(q: string): string {
  return q.trim().slice(0, MAX_QUESTION).trim();
}

export * from "./history";
