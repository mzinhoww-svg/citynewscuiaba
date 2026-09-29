import { render, screen } from "@testing-library/react";
import { EditorialScore } from "./EditorialScore";
import { FrequencyLabel, frequencyText } from "./FrequencyLabel";
import { HealthBadge } from "./HealthBadge";
import { SourceStatusBadge } from "./SourceStatusBadge";

describe("SourceStatusBadge", () => {
  it("mostra ícone e texto para cada estado", () => {
    const { rerender } = render(<SourceStatusBadge status="active" />);
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    rerender(<SourceStatusBadge status="degraded" />);
    expect(screen.getByText("Instável")).toBeInTheDocument();
    rerender(<SourceStatusBadge status="blocked" reason="opt_out" />);
    expect(screen.getByText("Bloqueada")).toBeInTheDocument();
    expect(screen.getByText(/A fonte pediu para sair/)).toBeInTheDocument();
  });
  it("motivo da pausa em texto, inclusive a automática", () => {
    render(<SourceStatusBadge status="paused" reason="auto_failures" />);
    expect(screen.getByText("Pausada")).toBeInTheDocument();
    expect(screen.getByText(/Pausa automática por falhas/)).toBeInTheDocument();
  });
  it("arquivada sobrepõe o estado", () => {
    render(<SourceStatusBadge status="paused" reason="manual" archived />);
    expect(screen.getByText("Arquivada")).toBeInTheDocument();
    expect(screen.queryByText("Pausada")).not.toBeInTheDocument();
  });
  it("ícone é decorativo", () => {
    const { container } = render(<SourceStatusBadge status="active" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("EditorialScore", () => {
  it("lê como texto e esconde as estrelas", () => {
    const { container } = render(<EditorialScore score={4} />);
    expect(screen.getByText("4 de 5")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")?.textContent).toBe("★★★★★");
  });
  it("limita entre 1 e 5", () => {
    render(<EditorialScore score={9} />);
    expect(screen.getByText("5 de 5")).toBeInTheDocument();
  });
});

describe("HealthBadge", () => {
  it("rótulo e número; sem dados não mostra número", () => {
    const { rerender } = render(<HealthBadge state="atencao" score={62} />);
    expect(screen.getByText("Atenção")).toBeInTheDocument();
    expect(screen.getByText("· 62")).toBeInTheDocument();
    rerender(<HealthBadge state="sem_dados" score={null} />);
    expect(screen.getByText("Sem dados")).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});

describe("FrequencyLabel", () => {
  it("textos do plano", () => {
    expect(frequencyText({ chosen: null, effective: 30, raisedBy: null })).toBe("30 min · padrão");
    expect(frequencyText({ chosen: 10, effective: 10, raisedBy: null })).toBe(
      "10 min · via rápida",
    );
    expect(frequencyText({ chosen: 10, effective: 20, raisedBy: "robots" })).toBe(
      "20 min · via rápida (robots)",
    );
    expect(frequencyText({ chosen: 60, effective: 60, raisedBy: null })).toBe("1 h");
    expect(frequencyText({ chosen: 30, effective: 60, raisedBy: "terms" })).toBe("1 h (termos)");
  });
  it("mostra a origem da elevação e a próxima coleta no horário de Cuiabá", () => {
    render(
      <FrequencyLabel
        chosen={30}
        effective={60}
        raisedBy="robots"
        showNext
        nextAt="2026-09-27T20:00:00Z"
      />,
    );
    expect(screen.getByText("1 h (robots)")).toBeInTheDocument();
    expect(screen.getByText(/Crawl-delay/)).toBeInTheDocument();
    expect(screen.getByText("Próxima coleta 16:00")).toBeInTheDocument();
  });
  it("sem coleta prevista", () => {
    render(<FrequencyLabel chosen={null} effective={30} raisedBy={null} showNext nextAt={null} />);
    expect(screen.getByText("Sem coleta prevista")).toBeInTheDocument();
  });
});
