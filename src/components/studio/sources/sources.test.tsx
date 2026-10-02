import { render, screen } from "@testing-library/react";
import { EditorialScore, FrequencyLabel, HealthBadge, SourceStatusBadge } from "../../estudio";

describe("SourceStatusBadge", () => {
  it("ícone + texto, com o motivo em texto", () => {
    const { container } = render(<SourceStatusBadge status="auto_paused" reason="auto_failures" />);
    expect(container.textContent).toContain("Pausada automaticamente");
    expect(container.textContent).toContain("Após 3 falhas seguidas");
    // O ícone é decorativo: o sentido está no texto.
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("auto_paused");
  });

  it("sem motivo mostra só o status", () => {
    const { container } = render(<SourceStatusBadge status="active" />);
    expect(container.textContent).toBe("Ativa");
  });

  it("bloqueada a pedido do veículo", () => {
    render(<SourceStatusBadge status="blocked" reason="opt_out" />);
    expect(screen.getByText("Bloqueada")).toBeInTheDocument();
    expect(screen.getByText(/Pedido do veículo/)).toBeInTheDocument();
  });
});

describe("EditorialScore", () => {
  it('"4 de 5" em texto; estrelas escondidas do leitor de tela', () => {
    const { container } = render(<EditorialScore score={4} />);
    expect(screen.getByText("4 de 5")).toBeInTheDocument();
    const stars = container.querySelector("[aria-hidden='true']");
    expect(stars?.querySelectorAll("svg")).toHaveLength(5);
    expect(stars?.querySelectorAll("[data-filled='true'] svg")).toHaveLength(4);
  });
});

describe("HealthBadge", () => {
  it("número e rótulo", () => {
    const { container } = render(<HealthBadge score={82} label="saudavel" />);
    expect(container.textContent).toContain("82");
    expect(container.textContent).toContain("Saudável");
  });
  it("sem dados", () => {
    const { container } = render(<HealthBadge score={null} label="sem_dados" />);
    expect(container.textContent).toBe("Sem dados");
  });
});

describe("FrequencyLabel", () => {
  it('"30 min · padrão" quando segue o padrão global', () => {
    const { container } = render(
      <FrequencyLabel frequencyMinutes={null} effective={{ minutes: 30, raisedBy: null }} />,
    );
    expect(container.textContent).toBe("30 min · padrão");
  });

  it('"10 min · via rápida"', () => {
    const { container } = render(
      <FrequencyLabel frequencyMinutes={10} effective={{ minutes: 10, raisedBy: null }} />,
    );
    expect(container.textContent).toBe("10 min · via rápida");
  });

  it('"20 min · via rápida (robots)" quando o robots.txt eleva a frequência', () => {
    const { container } = render(
      <FrequencyLabel frequencyMinutes={10} effective={{ minutes: 20, raisedBy: "robots" }} />,
    );
    expect(container.textContent).toBe("20 min · via rápida (robots)");
  });

  it('horas e "Próxima coleta 16:00" no fuso de Cuiabá', () => {
    const { container } = render(
      <FrequencyLabel
        frequencyMinutes={120}
        effective={{ minutes: 120, raisedBy: null }}
        nextCollectionAt="2026-09-27T20:00:00Z"
      />,
    );
    expect(container.textContent).toContain("2 h");
    expect(screen.getByText("Próxima coleta 16:00")).toBeInTheDocument();
  });

  it("1 h 30", () => {
    const { container } = render(
      <FrequencyLabel frequencyMinutes={90} effective={{ minutes: 90, raisedBy: null }} />,
    );
    expect(container.textContent).toBe("1 h 30");
  });
});
