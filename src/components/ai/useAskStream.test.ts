import { act, renderHook, waitFor } from "@testing-library/react";
import type { AiAnswer } from "@/lib/ai/answer";
import { useAskStream } from "./useAskStream";

/*
 * UI-T13: `useAskStream` sobre `POST /api/ask` (NDJSON: `status` e depois `answer`).
 * Review Focus 2: rede caindo no meio do stream, ou stream sem `answer`, vira `error` e o
 * campo volta a aceitar pergunta (`busy` = false).
 */

const ANSWER: Extract<AiAnswer, { kind: "answer" }> = {
  kind: "answer",
  basis: "multiple_sources",
  confidence: "alta",
  facts: [{ text: "O plano começa em 6 de outubro.", citations: [0, 1] }],
  inferences: [],
  gaps: [],
  conflicts: [],
  sources: [],
  asOf: "2026-10-04T15:40:00Z",
};

const enc = new TextEncoder();
const line = (v: unknown) => enc.encode(`${JSON.stringify(v)}\n`);

/** Resposta NDJSON; `cut` derruba a conexão depois das linhas enviadas. */
function ndjson(events: unknown[], { cut = false } = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(line(e));
      if (cut) c.error(new TypeError("network error"));
      else c.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
}

const answerEvent = (answer: AiAnswer, extra: { aiOff?: boolean; limit?: number } = {}) => ({
  type: "answer",
  answer,
  aiOff: extra.aiOff ?? false,
  limit: extra.limit ?? 20,
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("envia POST com a pergunta, passa por processing e aplica a resposta", async () => {
  let release!: (r: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((r) => {
        release = r;
      }),
  );
  const { result } = renderHook(() => useAskStream({ fetcher }));

  act(() => result.current.send("  O que muda no CPA?  "));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/ask",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ q: "O que muda no CPA?" }) }),
  );
  expect(result.current.busy).toBe(true);
  expect(result.current.messages).toHaveLength(1);
  expect(result.current.messages[0]).toMatchObject({
    question: "O que muda no CPA?",
    status: "processing",
    step: "sources",
  });

  await act(async () =>
    release(ndjson([{ type: "status", step: "sources" }, answerEvent(ANSWER)])),
  );
  await waitFor(() => expect(result.current.messages[0]?.status).toBe("answer"));
  expect(result.current.messages[0]?.answer).toEqual(ANSWER);
  expect(result.current.busy).toBe(false);
});

it("passos locais: Buscando fontes, Comparando depois de 2 s, Escrevendo depois de 5 s", async () => {
  vi.useFakeTimers();
  let release!: (r: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((r) => {
        release = r;
      }),
  );
  const { result } = renderHook(() => useAskStream({ fetcher }));
  act(() => result.current.send("Qualidade do ar"));
  expect(result.current.messages[0]?.step).toBe("sources");
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.messages[0]?.step).toBe("comparing");
  act(() => vi.advanceTimersByTime(3000));
  expect(result.current.messages[0]?.step).toBe("writing");
  vi.useRealTimers();
  await act(async () => release(ndjson([answerEvent(ANSWER)])));
  await waitFor(() => expect(result.current.messages[0]?.status).toBe("answer"));
});

it("ignora segunda pergunta enquanto busy", async () => {
  let release!: (r: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((r) => {
        release = r;
      }),
  );
  const { result } = renderHook(() => useAskStream({ fetcher }));
  act(() => {
    result.current.send("Primeira");
    result.current.send("Segunda");
  });
  act(() => result.current.send("Terceira"));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result.current.messages.map((m) => m.question)).toEqual(["Primeira"]);
  await act(async () => release(ndjson([answerEvent(ANSWER)])));
  await waitFor(() => expect(result.current.busy).toBe(false));
});

it("pergunta vazia não envia; pergunta longa é cortada em 300 caracteres", () => {
  const fetcher = vi.fn(() => new Promise<Response>(() => {}));
  const { result } = renderHook(() => useAskStream({ fetcher }));
  act(() => result.current.send("   "));
  expect(fetcher).not.toHaveBeenCalled();
  act(() => result.current.send("a".repeat(400)));
  expect(result.current.messages[0]?.question).toHaveLength(300);
});

it("erro de rede vira turno error e libera o campo", async () => {
  const fetcher = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
  const { result } = renderHook(() => useAskStream({ fetcher }));
  act(() => result.current.send("Ônibus"));
  await waitFor(() => expect(result.current.messages[0]?.status).toBe("error"));
  expect(result.current.messages[0]?.answer).toBeUndefined();
  expect(result.current.busy).toBe(false);
});

it("Review Focus: rede cai no meio do stream → error, e o campo reaceita a pergunta", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(ndjson([{ type: "status", step: "sources" }], { cut: true }))
    .mockResolvedValueOnce(ndjson([answerEvent(ANSWER)]));
  const { result } = renderHook(() => useAskStream({ fetcher }));
  act(() => result.current.send("Viaduto"));
  await waitFor(() => expect(result.current.messages[0]?.status).toBe("error"));
  expect(result.current.busy).toBe(false);
  act(() => result.current.send("Viaduto de novo"));
  await waitFor(() => expect(result.current.messages[1]?.status).toBe("answer"));
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("Review Focus: stream que termina sem answer vira error", async () => {
  const fetcher = vi.fn().mockResolvedValue(ndjson([{ type: "status", step: "sources" }]));
  const { result } = renderHook(() => useAskStream({ fetcher }));
  act(() => result.current.send("Sem fim"));
  await waitFor(() => expect(result.current.messages[0]?.status).toBe("error"));
  expect(result.current.busy).toBe(false);
});

it("resposta HTTP de erro (400/500) vira error", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
  const { result } = renderHook(() => useAskStream({ fetcher }));
  act(() => result.current.send("Falha"));
  await waitFor(() => expect(result.current.messages[0]?.status).toBe("error"));
});

it("aiOff vira off; insufficient vira refused; limite esgotado vira rate_limited", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      ndjson([answerEvent({ kind: "error", reason: "unavailable" }, { aiOff: true })]),
    )
    .mockResolvedValueOnce(
      ndjson([answerEvent({ kind: "insufficient", found: [], suggestion: "traditional_search" })]),
    )
    .mockResolvedValueOnce(
      ndjson([
        answerEvent(
          { kind: "error", reason: "rate_limited", retryAt: "2026-10-04T16:00:00Z" },
          { limit: 20 },
        ),
      ]),
    )
    .mockResolvedValueOnce(ndjson([answerEvent({ kind: "error", reason: "timeout" })]));
  const { result } = renderHook(() => useAskStream({ fetcher }));
  for (const q of ["um", "dois", "três", "quatro"]) {
    act(() => result.current.send(q));
    await waitFor(() => expect(result.current.busy).toBe(false));
  }
  expect(result.current.messages.map((m) => m.status)).toEqual([
    "off",
    "refused",
    "rate_limited",
    "error",
  ]);
  expect(result.current.messages[2]?.limit).toBe(20);
  expect(result.current.messages[3]?.answer).toEqual({ kind: "error", reason: "timeout" });
});

it("retry troca o turno com erro por uma nova tentativa da mesma pergunta", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValueOnce(ndjson([answerEvent(ANSWER)]));
  const { result } = renderHook(() => useAskStream({ fetcher }));
  act(() => result.current.send("CPA"));
  await waitFor(() => expect(result.current.messages[0]?.status).toBe("error"));
  const id = result.current.messages[0]!.id;
  act(() => result.current.retry(id));
  await waitFor(() => expect(result.current.messages[0]?.status).toBe("answer"));
  expect(result.current.messages).toHaveLength(1);
  expect(result.current.messages[0]?.question).toBe("CPA");
});

it("reset carrega uma conversa salva ou começa uma nova", () => {
  const fetcher = vi.fn();
  const { result } = renderHook(() => useAskStream({ fetcher }));
  const saved = [
    {
      id: "t1",
      question: "Antiga",
      status: "answer" as const,
      answer: ANSWER,
      askedAt: "2026-10-03T10:00:00Z",
    },
  ];
  act(() => result.current.reset(saved));
  expect(result.current.messages).toEqual(saved);
  act(() => result.current.reset());
  expect(result.current.messages).toEqual([]);
});
