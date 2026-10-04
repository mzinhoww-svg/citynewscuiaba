import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AiAnswer as AiAnswerData, SourceRef } from "@/lib/ai/answer";
import { memoryChatHistory } from "@/lib/ask/history";
import { ACCEPT_ALL, NECESSARY_ONLY } from "@/lib/consent";
import { ConsentProvider } from "@/lib/consent/client";
import { AskChat } from "./AskChat";
import { ChatComposer } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import type { ChatTurn } from "./useAskStream";

/*
 * UI-T13 · Pergunte ao CityNews como chat (spec 2026-10-02-ui-publica-design §4.8, critério 8).
 */

const sources: SourceRef[] = [
  {
    id: "a1",
    kind: "article",
    title: "Prefeitura detalha novo plano de ônibus",
    url: "/materia/prefeitura-detalha",
    sourceName: "Redação CityNews",
    publisher: "citynews",
    publishedAt: "2026-09-25T16:00:00Z",
    primary: false,
    sponsored: false,
    label: { kind: "original", text: "ORIGINAL CITYNEWS" },
  },
  {
    id: "g1",
    kind: "aggregated",
    title: "Linha expressa terá saídas a cada 12 minutos",
    url: "https://mtagora.example/x",
    sourceName: "MT Agora",
    publisher: "mt-agora",
    publishedAt: "2026-09-25T14:45:00Z",
    primary: false,
    sponsored: false,
    label: { kind: "aggregated", text: "AGREGADO", detail: "MT Agora" },
  },
];

const ANSWER: Extract<AiAnswerData, { kind: "answer" }> = {
  kind: "answer",
  confidence: "alta",
  facts: [{ text: "O plano começa em 6 de outubro.", citations: [0, 1] }],
  inferences: [{ text: "Deve haver ajuste de horários.", citations: [1] }],
  gaps: ["Se haverá reforço à noite."],
  conflicts: [
    {
      topic: "Intervalo no pico",
      positions: [
        { text: "12 minutos.", citations: [1] },
        { text: "15 minutos.", citations: [0] },
      ],
    },
  ],
  sources,
  asOf: "2026-10-04T18:40:00Z",
};

const turn = (over: Partial<ChatTurn>): ChatTurn => ({
  id: "t1",
  question: "O que muda no plano de ônibus do CPA?",
  status: "answer",
  answer: ANSWER,
  askedAt: "2026-10-04T18:39:00Z",
  ...over,
});

const noop = () => {};
const FORBIDDEN = [/\bIA\b/, /intelig[eê]ncia artificial/i];

function threadOf(messages: ChatTurn[], extra: Partial<Parameters<typeof ChatThread>[0]> = {}) {
  return render(
    <ChatThread messages={messages} onAsk={noop} onRetry={noop} onCite={noop} {...extra} />,
  );
}

describe("ChatThread", () => {
  it("vazio: boas-vindas do CityNews e 4 perguntas iniciais como botões", async () => {
    const onAsk = vi.fn();
    threadOf([], { onAsk });
    expect(screen.getByRole("heading", { name: "Respostas só com fontes" })).toBeInTheDocument();
    const starters = within(
      screen.getByRole("list", { name: "Perguntas para começar" }),
    ).getAllByRole("button");
    expect(starters).toHaveLength(4);
    await userEvent.click(starters[0]!);
    expect(onAsk).toHaveBeenCalledWith(starters[0]!.textContent);
  });

  it("cada turno tem a bolha da pessoa e a do CityNews; resposta separa os blocos", () => {
    threadOf([turn({})]);
    const you = screen.getByText("O que muda no plano de ônibus do CPA?");
    expect(you.closest("[data-author='person']")).not.toBeNull();
    const reply = screen.getByRole("article", { name: "Resposta do CityNews" });
    expect(reply.closest("[data-author='citynews']")).not.toBeNull();

    const facts = screen.getByRole("region", { name: "O que se sabe" });
    expect(within(facts).getByRole("link", { name: "Fonte 1" })).toBeInTheDocument();
    expect(within(facts).getByRole("link", { name: "Fonte 2" })).toBeInTheDocument();
    const inference = screen.getByRole("region", { name: "Inferência" });
    expect(inference.querySelector(".border-dashed")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Ainda não se sabe" })).toHaveTextContent(
      "reforço à noite",
    );
    expect(screen.getByRole("region", { name: "Onde as fontes divergem" })).toHaveTextContent(
      "Intervalo no pico",
    );
  });

  it("processando mostra o passo atual", () => {
    threadOf([turn({ status: "processing", answer: undefined, step: "comparing" })]);
    expect(screen.getByText("Comparando")).toBeInTheDocument();
  });

  it("recusa (sem fonte) explica o motivo e oferece a busca tradicional", () => {
    threadOf([
      turn({
        status: "refused",
        answer: { kind: "insufficient", found: [sources[1]!], suggestion: "traditional_search" },
      }),
    ]);
    expect(screen.getByText(/só responde com fonte/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Buscar do jeito tradicional" });
    expect(link.getAttribute("href")).toMatch(/^\/busca\?/);
  });

  it("limite esgotado mostra o horário de liberação", () => {
    threadOf([
      turn({
        status: "rate_limited",
        limit: 20,
        answer: { kind: "error", reason: "rate_limited", retryAt: "2026-10-04T19:00:00Z" },
      }),
    ]);
    expect(screen.getByText(/limite de 20 perguntas por hora/)).toBeInTheDocument();
    expect(screen.getByText(/O limite libera às \d/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buscar do jeito tradicional" })).toBeInTheDocument();
  });

  it("assistente indisponível mostra a busca tradicional", () => {
    threadOf([turn({ status: "off", answer: { kind: "error", reason: "unavailable" } })]);
    expect(screen.getByText("Assistente indisponível")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buscar do jeito tradicional" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });

  it("falha oferece Tentar de novo", async () => {
    const onRetry = vi.fn();
    threadOf([turn({ id: "t9", status: "error", answer: undefined })], { onRetry });
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onRetry).toHaveBeenCalledWith("t9");
  });

  it("citação [n] avisa qual fonte abrir", async () => {
    const onCite = vi.fn();
    threadOf([turn({})], { onCite });
    const facts = screen.getByRole("region", { name: "O que se sabe" });
    await userEvent.click(within(facts).getByRole("link", { name: "Fonte 2" }));
    expect(onCite).toHaveBeenCalledWith("t1", 2);
  });

  it("nenhum texto do chat diz IA ou inteligência artificial, em nenhum estado", () => {
    const states: ChatTurn[] = [
      turn({ id: "a" }),
      turn({ id: "b", status: "processing", answer: undefined, step: "writing" }),
      turn({
        id: "c",
        status: "refused",
        answer: { kind: "insufficient", found: [], suggestion: "traditional_search" },
      }),
      turn({ id: "d", status: "off", answer: { kind: "error", reason: "unavailable" } }),
      turn({ id: "e", status: "error", answer: { kind: "error", reason: "provider" } }),
      turn({ id: "f", status: "error", answer: undefined }),
      turn({
        id: "g",
        status: "rate_limited",
        limit: 20,
        answer: { kind: "error", reason: "rate_limited", retryAt: "2026-10-04T19:00:00Z" },
      }),
    ];
    const { container, unmount } = threadOf(states);
    for (const re of FORBIDDEN) expect(container.textContent).not.toMatch(re);
    unmount();
    const empty = threadOf([]);
    for (const re of FORBIDDEN) expect(empty.container.textContent).not.toMatch(re);
  });
});

describe("ChatComposer", () => {
  it("Enter envia, Shift+Enter quebra linha, botão com nome acessível", async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);
    const field = screen.getByRole("textbox", { name: "Sua pergunta" });
    await userEvent.type(field, "Linha um{Shift>}{Enter}{/Shift}linha dois");
    expect(onSend).not.toHaveBeenCalled();
    expect(field).toHaveValue("Linha um\nlinha dois");
    await userEvent.type(field, "{Enter}");
    expect(onSend).toHaveBeenCalledWith("Linha um\nlinha dois");
    expect(field).toHaveValue("");
    expect(screen.getByRole("button", { name: "Enviar pergunta" })).toBeInTheDocument();
  });

  it("contador aparece a partir de 250 caracteres; máximo de 300", () => {
    render(<ChatComposer onSend={noop} />);
    const field = screen.getByRole("textbox", { name: "Sua pergunta" });
    expect(field).toHaveAttribute("maxLength", "300");
    fireEvent.change(field, { target: { value: "a".repeat(249) } });
    expect(screen.queryByText(/de 300/)).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "a".repeat(250) } });
    expect(screen.getByText("250 de 300")).toBeInTheDocument();
  });

  it("desabilitado: Enter não envia e o texto fica", async () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} disabled />);
    const field = screen.getByRole("textbox", { name: "Sua pergunta" });
    await userEvent.type(field, "Espera{Enter}");
    expect(onSend).not.toHaveBeenCalled();
    expect(field).toHaveValue("Espera");
  });

  it("sem JS, é um formulário GET para /pergunte no modo simples", () => {
    const { container } = render(<ChatComposer onSend={noop} />);
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("action", "/pergunte");
    expect(form).toHaveAttribute("method", "get");
    expect(container.querySelector("textarea[name='q']")).not.toBeNull();
    expect(container.querySelector("input[name='modo'][value='simples']")).not.toBeNull();
  });
});

// --- Chat completo: rota, foco, aria-live, fontes e histórico ---

const enc = new TextEncoder();
function ndjson(events: unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      c.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
}
const okAnswer = () =>
  ndjson([
    { type: "status", step: "sources" },
    { type: "answer", answer: ANSWER, aiOff: false, limit: 20 },
  ]);

function mockFetch() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => okAnswer());
}

afterEach(() => vi.restoreAllMocks());

describe("AskChat", () => {
  it("aviso fixo, campo rotulado e região aria-live polite anunciando o fim da resposta", async () => {
    mockFetch();
    render(<AskChat />);
    expect(screen.getByText("Pode conter erros. Confira nas fontes.")).toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    await userEvent.type(screen.getByRole("textbox", { name: "Sua pergunta" }), "CPA{Enter}");
    await waitFor(() => expect(status).toHaveTextContent("Resposta pronta"));
  });

  it("foco volta ao campo depois de enviar por uma pergunta inicial", async () => {
    mockFetch();
    render(<AskChat />);
    const starter = within(
      screen.getByRole("list", { name: "Perguntas para começar" }),
    ).getAllByRole("button")[0]!;
    await userEvent.click(starter);
    expect(screen.getByRole("textbox", { name: "Sua pergunta" })).toHaveFocus();
    await screen.findByRole("article", { name: "Resposta do CityNews" });
  });

  it("/pergunte?q= abre já com a pergunta enviada (uma vez só)", async () => {
    const f = mockFetch();
    render(<AskChat initialQuestion="O que aconteceu em Cuiabá hoje?" />);
    await screen.findByRole("article", { name: "Resposta do CityNews" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(screen.getByText("O que aconteceu em Cuiabá hoje?")).toBeInTheDocument();
  });

  it("citação [n] abre a lista de fontes e marca a fonte n", async () => {
    mockFetch();
    render(<AskChat initialQuestion="Ônibus" />);
    const article = await screen.findByRole("article", { name: "Resposta do CityNews" });
    const facts = within(article).getByRole("region", { name: "O que se sabe" });
    await userEvent.click(within(facts).getByRole("link", { name: "Fonte 2" }));
    const [inline] = screen.getAllByTestId(/^fontes-inline/);
    expect(inline).toHaveAttribute("open");
    const active = document.querySelectorAll("[aria-current='true']");
    expect(active.length).toBeGreaterThan(0);
    for (const el of active) expect(el).toHaveTextContent(/Linha expressa/);
  });

  it("histórico local só com Personalização aceita", async () => {
    mockFetch();
    const store = memoryChatHistory();
    const { unmount } = render(
      <ConsentProvider initial={NECESSARY_ONLY}>
        <AskChat historyStore={store} />
      </ConsentProvider>,
    );
    expect(screen.queryByRole("region", { name: "Conversas neste aparelho" })).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "Sua pergunta" }), "Sem{Enter}");
    await screen.findByRole("article", { name: "Resposta do CityNews" });
    expect(await store.list()).toEqual([]);
    unmount();

    render(
      <ConsentProvider initial={ACCEPT_ALL}>
        <AskChat historyStore={store} />
      </ConsentProvider>,
    );
    expect(screen.getByRole("region", { name: "Conversas neste aparelho" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Sua pergunta" }), "Com{Enter}");
    await screen.findByRole("article", { name: "Resposta do CityNews" });
    await waitFor(async () => expect(await store.list()).toHaveLength(1));
    const [saved] = await store.list();
    expect(saved?.turns.map((t) => t.question)).toEqual(["Com"]);
    await act(async () => {});
  });
});

describe("ChatComposer sem JavaScript (Review Focus 3)", () => {
  it("o HTML do servidor não marca o botão de enviar como desabilitado", async () => {
    const { renderToString } = await import("react-dom/server");
    const html = renderToString(<ChatComposer onSend={() => {}} />);
    expect(html).toContain('aria-label="Enviar pergunta"');
    expect(html).not.toContain("aria-disabled");
  });
});
