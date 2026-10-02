import { render, screen, within } from "@testing-library/react";
import { ConfidenceMeter, MadeHow, OriginLabel, TopicStatus } from "../index";

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

describe("ConfidenceMeter", () => {
  it("confiança não depende de cor: tem texto", () => {
    render(<ConfidenceMeter level="média" />);
    expect(screen.getByText("Confiança média")).toBeInTheDocument();
  });

  it("três barras, preenchidas conforme o nível", () => {
    const { container } = render(<ConfidenceMeter level="alta" />);
    expect(container.querySelectorAll("[data-bar]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-bar='on']")).toHaveLength(3);
    const low = render(<ConfidenceMeter level="baixa" />);
    expect(low.container.querySelectorAll("[data-bar='on']")).toHaveLength(1);
  });
});

describe("TopicStatus", () => {
  it.each([
    ["em_apuracao", "Em apuração"],
    ["confirmado", "Confirmado"],
    ["corrigido", "Corrigido"],
    ["encerrado", "Encerrado"],
  ] as const)("%s mostra %s", (state, text) => {
    render(<TopicStatus state={state} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe("MadeHow", () => {
  const article = {
    kind: "normalized" as const,
    sourceCount: 3,
    publishMode: "auto" as const,
    image: { kind: "reproduction" as const, credit: "folhadocerrado.example" },
    sponsored: true,
  };

  it("explica em linguagem simples: de quantas fontes, quem revisou, de onde vêm as imagens", () => {
    render(<MadeHow article={article} versionsHref="/materia/x/historico" />);
    const region = screen.getByRole("region", { name: "Como esta matéria foi feita" });
    expect(within(region).getByText(/feito a partir de 3 fontes/i)).toBeInTheDocument();
    expect(within(region).getByText(/publicado pelas regras do CityNews/i)).toBeInTheDocument();
    expect(
      within(region).getByText(/Reprodução web de folhadocerrado.example/),
    ).toBeInTheDocument();
    expect(within(region).getByText(/pago por um anunciante/i)).toBeInTheDocument();
    expect(within(region).queryAllByTestId("origin-label")).toHaveLength(0);
    expect(region.textContent).not.toMatch(/normaliz|\bIA\b|inteligência artificial/i);
  });

  it("revisão por pessoa mostra o nome; agente e histórico continuam", () => {
    render(
      <MadeHow
        article={{ kind: "original", publishMode: "human", reviewer: "Marina Couto" }}
        agentVersion="redator v3"
        versionsHref="/materia/x/historico"
      />,
    );
    expect(screen.getByText(/Marina Couto/)).toBeInTheDocument();
    expect(screen.getByText(/redator v3/)).toBeInTheDocument();
    expect(screen.getByText(/apurada e escrita pela redação/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver histórico de versões" })).toHaveAttribute(
      "href",
      "/materia/x/historico",
    );
  });
});
