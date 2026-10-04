import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RadioGroup } from "./RadioGroup";

const options = [
  { value: "dia", label: "Uma vez por dia", hint: "Às 7h" },
  { value: "semana", label: "Uma vez por semana" },
] as const;

describe("RadioGroup", () => {
  it("group com o nome da legenda e rádios rotulados", () => {
    render(<RadioGroup name="freq" legend="Frequência" options={options} />);
    expect(screen.getByRole("group", { name: "Frequência" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByLabelText("Uma vez por semana")).toHaveAttribute("value", "semana");
  });

  it("onChange recebe o valor escolhido", () => {
    const onChange = vi.fn();
    render(<RadioGroup name="freq" legend="Frequência" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Uma vez por semana"));
    expect(onChange).toHaveBeenCalledWith("semana");
  });

  it("com erro: grupo e rádios ligados à mensagem", () => {
    render(
      <RadioGroup name="freq" legend="Frequência" options={options} error="Escolha uma opção" />,
    );
    const radio = screen.getByLabelText("Uma vez por dia");
    expect(radio).not.toHaveAttribute("aria-invalid");
    expect(radio).toHaveAttribute("aria-describedby", "freq-dia-dica freq-erro");
    expect(document.getElementById("freq-erro")).toHaveTextContent("Escolha uma opção");
    expect(screen.getByRole("group", { name: "Frequência" })).toHaveAttribute(
      "aria-describedby",
      "freq-erro",
    );
  });
});
