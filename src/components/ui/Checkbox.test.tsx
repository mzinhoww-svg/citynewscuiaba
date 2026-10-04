import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("rótulo associado, alterna e chama onChange(true)", () => {
    const onChange = vi.fn();
    render(<Checkbox name="aceito" label="Aceito os termos" onChange={onChange} />);
    const box = screen.getByLabelText("Aceito os termos");
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("dica ligada por aria-describedby", () => {
    render(<Checkbox id="c" name="c" label="Receber avisos" hint="Uma vez por dia" />);
    const box = screen.getByLabelText("Receber avisos");
    expect(box).toHaveAttribute("aria-describedby", "c-dica");
    expect(document.getElementById("c-dica")).toHaveTextContent("Uma vez por dia");
  });

  it("linha com alvo de toque e caixa de 20 px", () => {
    render(<Checkbox name="c" label="Receber avisos" />);
    expect(screen.getByText("Receber avisos").closest("label")).toHaveClass("min-h-tap");
    expect(screen.getByLabelText("Receber avisos")).toHaveClass("size-5");
  });
});
