import {
  cleanQuestion,
  memoryChatHistory,
  normalizeConversations,
  parseAnswerLine,
  statusOf,
  type ChatTurn,
} from "./index";

const turn = (over: Partial<ChatTurn> = {}): ChatTurn => ({
  id: "t1",
  question: "CPA",
  status: "answer",
  askedAt: "2026-10-04T10:00:00Z",
  ...over,
});

it("parseAnswerLine lê só o evento answer válido", () => {
  expect(parseAnswerLine('{"type":"status","step":"sources"}')).toBeNull();
  expect(parseAnswerLine("não é json")).toBeNull();
  expect(parseAnswerLine("")).toBeNull();
  expect(parseAnswerLine('{"type":"answer","answer":{"kind":"outro"}}')).toBeNull();
  expect(
    parseAnswerLine('{"type":"answer","answer":{"kind":"error","reason":"timeout"},"limit":20}'),
  ).toEqual({
    type: "answer",
    answer: { kind: "error", reason: "timeout" },
    aiOff: false,
    limit: 20,
  });
});

it("statusOf mapeia off, answer, refused, rate_limited e error", () => {
  const ev = (answer: unknown, aiOff = false) =>
    parseAnswerLine(JSON.stringify({ type: "answer", answer, aiOff, limit: 20 }))!;
  expect(statusOf(ev({ kind: "error", reason: "unavailable" }, true))).toBe("off");
  expect(statusOf(ev({ kind: "insufficient", found: [], suggestion: "traditional_search" }))).toBe(
    "refused",
  );
  expect(statusOf(ev({ kind: "error", reason: "rate_limited" }))).toBe("rate_limited");
  expect(statusOf(ev({ kind: "error", reason: "provider" }))).toBe("error");
});

it("cleanQuestion apara e corta em 300", () => {
  expect(cleanQuestion("  oi  ")).toBe("oi");
  expect(cleanQuestion("a".repeat(301))).toHaveLength(300);
});

it("histórico guarda só turnos concluídos, mais recente primeiro, e apaga", async () => {
  const store = memoryChatHistory();
  await store.save({
    id: "c1",
    startedAt: "2026-10-04T10:00:00Z",
    turns: [turn(), turn({ id: "t2", status: "processing", step: "sources" })],
  });
  await store.save({ id: "c2", startedAt: "2026-10-04T11:00:00Z", turns: [turn({ id: "t3" })] });
  const list = await store.list();
  expect(list.map((c) => c.id)).toEqual(["c2", "c1"]);
  expect(list[1]?.turns.map((t) => t.id)).toEqual(["t1"]);
  await store.clear();
  expect(await store.list()).toEqual([]);
});

it("normalizeConversations descarta lixo do navegador", () => {
  expect(normalizeConversations("x")).toEqual([]);
  expect(
    normalizeConversations([{ id: 1 }, { id: "c", startedAt: "x", turns: [{ id: "t" }] }]),
  ).toEqual([]);
});
