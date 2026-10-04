import { render, screen, within } from "@testing-library/react";
import type { AiAnswer as AiAnswerData, SourceRef } from "@/lib/ai/answer";
import { AiAnswer, AiStatusPanel, SourceRail } from "../index";

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
    label: { kind: "normalized", text: "NORMALIZADO PELO CITYNEWS" },
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

const answer: Extract<AiAnswerData, { kind: "answer" }> = {
  kind: "answer",
  confidence: "baixa",
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
  asOf: "2026-09-27T18:00:00Z",
};

it("resposta separa fato, inferência, conflito e lacuna, com citações e aviso", () => {
  render(<AiAnswer answer={answer} />);
  expect(screen.getByRole("heading", { name: "Resposta do CityNews" })).toBeInTheDocument();
  expect(screen.queryByText(/RESUMO POR IA|gerada por IA/i)).not.toBeInTheDocument();
  expect(screen.getByText("Pode conter erros. Confira nas fontes.")).toBeInTheDocument();
  const facts = screen.getByRole("region", { name: "O que se sabe" });
  expect(within(facts).getByRole("link", { name: "Fonte 1" })).toHaveAttribute("href", "#fonte-1");
  expect(within(facts).getByRole("link", { name: "Fonte 2" })).toHaveAttribute("href", "#fonte-2");
  expect(screen.getByRole("region", { name: "Inferência" })).toHaveTextContent(/não confirmada/);
  expect(screen.getByRole("region", { name: "Onde as fontes divergem" })).toHaveTextContent(
    "Intervalo no pico",
  );
  expect(screen.getByRole("region", { name: "Ainda não se sabe" })).toBeInTheDocument();
});

it("resposta não mostra nível de confiança, nem medidor nem aviso de baixa confiança (R13)", () => {
  for (const confidence of ["alta", "média", "baixa"] as const) {
    const { container, unmount } = render(<AiAnswer answer={{ ...answer, confidence }} />);
    expect(container.textContent).not.toMatch(/confian/i);
    expect(container.querySelector("[data-bar]")).toBeNull();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    unmount();
  }
});

it("lista de fontes numerada, com alvo das citações e link externo em nova aba", () => {
  const { container } = render(<SourceRail sources={sources} />);
  expect(container.querySelector("#fonte-1")).not.toBeNull();
  const ext = screen.getByRole("link", { name: /Linha expressa/ });
  expect(ext).toHaveAttribute("target", "_blank");
  expect(ext).toHaveAttribute("rel", expect.stringContaining("noopener"));
  expect(screen.getByRole("link", { name: /Prefeitura detalha/ })).not.toHaveAttribute("target");
});

it("painel de estado tem título e passos; processando fica aria-busy", () => {
  render(<AiStatusPanel tone="processing" title="Preparando a resposta" steps={["Um", "Dois"]} />);
  const panel = screen.getByRole("region", { name: "Preparando a resposta" });
  expect(panel).toHaveAttribute("aria-busy", "true");
  expect(within(panel).getAllByRole("listitem")).toHaveLength(2);
});
