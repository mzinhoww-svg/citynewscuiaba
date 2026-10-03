import { render, screen, within } from "@testing-library/react";
import { MadeHow, OriginLabel, TopicStatus } from "../index";

describe("OriginLabel", () => {
  it("rótulo de IA tem borda tracejada e texto", () => {
    render(<OriginLabel label={{ kind: "ai_summary", text: "RESUMO POR IA" }} />);
    const el = screen.getByText("RESUMO POR IA");
    expect(el.closest("[data-kind='ai_summary']")).toHaveStyle({ borderStyle: "dashed" });
  });

  it("imagem gerada por IA também é tracejada; os demais, sólidos", () => {
    const { container } = render(
      <>
        <OriginLabel label={{ kind: "image_ai", text: "IMAGEM GERADA POR IA" }} />
        <OriginLabel label={{ kind: "auto_published", text: "PUBLICADO AUTOMATICAMENTE" }} />
      </>,
    );
    expect(container.querySelector("[data-kind='image_ai']")).toHaveStyle({
      borderStyle: "dashed",
    });
    expect(container.querySelector("[data-kind='auto_published']")).not.toHaveStyle({
      borderStyle: "dashed",
    });
  });

  it("mostra o detalhe depois do texto, com separador", () => {
    render(
      <OriginLabel label={{ kind: "aggregated", text: "AGREGADO", detail: "Folha do Cerrado" }} />,
    );
    const el = screen.getByTestId("origin-label");
    expect(el).toHaveTextContent("AGREGADO · Folha do Cerrado");
    expect(screen.getByText("AGREGADO")).toBeInTheDocument();
  });

  it("ícone é decorativo: o sentido está no texto", () => {
    render(<OriginLabel label={{ kind: "normalized", text: "NORMALIZADO PELO CITYNEWS" }} />);
    const svg = screen.getByTestId("origin-label").querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});

describe("TopicStatus", () => {
  it.each(["em_apuracao", "confirmado", "corrigido", "encerrado"] as const)(
    "%s não aparece para o público (R16, R34)",
    (state) => {
      const { container } = render(<TopicStatus state={state} />);
      expect(container).toBeEmptyDOMElement();
    },
  );
});

describe("MadeHow", () => {
  const article = {
    kind: "normalized" as const,
    sourceCount: 3,
    publishMode: "auto" as const,
    image: { kind: "reproduction" as const, credit: "folhadocerrado.example" },
    sponsored: true,
  };

  it("'De onde veio': só fontes, imagens, patrocínio e histórico, sem revisão (R17)", () => {
    render(<MadeHow article={article} versionsHref="/materia/x/historico" />);
    const region = screen.getByRole("region", { name: "De onde veio" });
    expect(within(region).getByText(/feito a partir de 3 fontes/i)).toBeInTheDocument();
    expect(within(region).queryByText("Quem revisou")).not.toBeInTheDocument();
    expect(region.textContent).not.toMatch(/revis|regras|automátic|gerad/i);
    expect(
      within(region).getByText(/Reprodução web de folhadocerrado.example/),
    ).toBeInTheDocument();
    expect(within(region).getByText(/pago por um anunciante/i)).toBeInTheDocument();
    expect(within(region).queryAllByTestId("origin-label")).toHaveLength(0);
    expect(region.textContent).not.toMatch(/normaliz|\bIA\b|inteligência artificial/i);
  });

  it("reportagem própria: nome do revisor nunca aparece; histórico continua, metodologia só se pedida", () => {
    const article = { kind: "original" as const, publishMode: "human", reviewer: "Marina Couto" };
    const { rerender } = render(<MadeHow article={article} versionsHref="/materia/x/historico" />);
    expect(document.body.textContent).not.toMatch(/Marina Couto|agente|regras de revisão/i);
    expect(screen.getByText(/apurada e escrita pela redação/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver histórico de versões" })).toHaveAttribute(
      "href",
      "/materia/x/historico",
    );
    expect(screen.queryByRole("link", { name: /metodologia/i })).not.toBeInTheDocument();
    rerender(
      <MadeHow
        article={article}
        versionsHref="/materia/x/historico"
        methodologyHref="/metodologia"
      />,
    );
    expect(screen.getByRole("link", { name: "Entenda a metodologia" })).toHaveAttribute(
      "href",
      "/metodologia",
    );
  });
});
