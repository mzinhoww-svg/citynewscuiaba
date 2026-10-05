import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextArea } from "./TextArea";

describe("TextArea", () => {
  it("rótulo associado", () => {
    render(<TextArea id="t" name="t" label="Comentário" />);
    expect(screen.getByLabelText("Comentário").tagName).toBe("TEXTAREA");
  });

  it("com erro e dica: aria-invalid e os dois ids", () => {
    render(<TextArea id="t" name="t" label="Comentário" hint="Seja breve" error="Escreva algo" />);
    const el = screen.getByLabelText("Comentário");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(el).toHaveAttribute("aria-describedby", "t-dica t-erro");
    expect(document.getElementById("t-erro")).toHaveTextContent("Escreva algo");
  });

  it("com maxLength mostra o contador e atualiza", () => {
    const onChange = vi.fn();
    render(<TextArea id="t" name="t" label="Comentário" maxLength={120} onChange={onChange} />);
    expect(screen.getByText("0/120")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Comentário"), { target: { value: "olá" } });
    expect(screen.getByText("3/120")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith("olá");
  });

  it("controlado: o contador segue o valor", () => {
    render(<TextArea id="t" name="t" label="Comentário" maxLength={10} value="abcd" />);
    expect(screen.getByText("4/10")).toBeInTheDocument();
  });
});
