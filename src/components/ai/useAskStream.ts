"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cleanQuestion,
  parseAnswerLine,
  statusOf,
  type AnswerEvent,
  type AskStep,
  type ChatTurn,
} from "@/lib/ask";

export type { AskStep, ChatStatus, ChatTurn } from "@/lib/ask";

export interface UseAskStreamOptions {
  /** Injeção para testes; padrão `fetch` global. */
  fetcher?: (input: string, init: RequestInit) => Promise<Response>;
  endpoint?: string;
  initial?: ChatTurn[];
}

/** Passos locais do indicador (spec §4.8): o servidor só manda `status` e depois `answer`. */
const STEP_AT: readonly [AskStep, number][] = [
  ["comparing", 2000],
  ["writing", 5000],
];

let seq = 0;
function newId(): string {
  seq += 1;
  return `t${Date.now().toString(36)}${seq}`;
}

/** Lê o NDJSON até o evento `answer`. Erro de rede no meio lança; stream sem `answer` dá `null`. */
async function readAnswer(res: Response): Promise<AnswerEvent | null> {
  if (!res.body) {
    for (const l of (await res.text()).split("\n")) {
      const ev = parseAnswerLine(l);
      if (ev) return ev;
    }
    return null;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });
    let nl = buffer.indexOf("\n");
    while (nl >= 0) {
      const ev = parseAnswerLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
      if (ev) {
        reader.cancel().catch(() => {});
        return ev;
      }
      nl = buffer.indexOf("\n");
    }
    if (done) return parseAnswerLine(buffer);
  }
}

/**
 * Conversa do Pergunte ao CityNews (UI-T13) sobre `POST /api/ask`. Uma pergunta por vez: enquanto
 * `busy`, `send` é ignorado. Falha de rede, resposta HTTP de erro ou stream que termina sem
 * `answer` viram turno `error` (com "Tentar de novo") e liberam o campo.
 */
export function useAskStream(options: UseAskStreamOptions = {}) {
  const { endpoint = "/api/ask", initial } = options;
  const fetcherRef = useRef(options.fetcher);
  useEffect(() => {
    fetcherRef.current = options.fetcher;
  }, [options.fetcher]);

  const [messages, setMessages] = useState<ChatTurn[]>(initial ?? []);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mounted = useRef(true);

  const clearTimers = () => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
      abortRef.current?.abort();
    };
  }, []);

  const patch = useCallback((id: string, next: Partial<ChatTurn>) => {
    if (!mounted.current) return;
    setMessages((list) => list.map((t) => (t.id === id ? { ...t, ...next } : t)));
  }, []);

  const run = useCallback(
    async (id: string, question: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      for (const [step, ms] of STEP_AT)
        timersRef.current.push(setTimeout(() => patch(id, { step }), ms));

      let ev: AnswerEvent | null = null;
      try {
        const doFetch = fetcherRef.current ?? ((u: string, i: RequestInit) => fetch(u, i));
        const res = await doFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: question }),
          signal: controller.signal,
        });
        if (res.ok) ev = await readAnswer(res);
      } catch {
        ev = null;
      }
      clearTimers();
      if (controller.signal.aborted) return;
      abortRef.current = null;
      if (ev) {
        patch(id, {
          status: statusOf(ev),
          answer: ev.answer,
          limit: ev.limit,
          step: undefined,
        });
      } else {
        patch(id, { status: "error", answer: undefined, step: undefined });
      }
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    },
    [endpoint, patch],
  );

  const start = useCallback(
    (question: string, replaceId?: string) => {
      const q = cleanQuestion(question);
      if (!q || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const t: ChatTurn = {
        id: newId(),
        question: q,
        status: "processing",
        step: "sources",
        askedAt: new Date().toISOString(),
      };
      setMessages((list) => {
        if (!replaceId) return [...list, t];
        const i = list.findIndex((x) => x.id === replaceId);
        return i < 0 ? [...list, t] : [...list.slice(0, i), t, ...list.slice(i + 1)];
      });
      void run(t.id, q);
    },
    [run],
  );

  const send = useCallback((question: string) => start(question), [start]);

  /** "Tentar de novo": a mesma pergunta no lugar do turno que falhou. */
  const retry = useCallback(
    (id: string) => {
      const t = messages.find((m) => m.id === id);
      if (t) start(t.question, id);
    },
    [messages, start],
  );

  /** Nova conversa (sem argumento) ou conversa salva. Cancela o que estiver em andamento. */
  const reset = useCallback((turns: ChatTurn[] = []) => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearTimers();
    busyRef.current = false;
    setBusy(false);
    setMessages(turns);
  }, []);

  return { send, retry, reset, messages, busy };
}
