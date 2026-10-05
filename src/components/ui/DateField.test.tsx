import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateField } from "./DateField";

describe("DateField", () => {
  it("rótulo associado e tipo date por padrão", () => {
    render(<DateField id="d" name="d" label="Data" />);
    expect(screen.getByLabelText("Data")).toHaveAttribute("type", "date");
  });

  it("aceita datetime-local e time", () => {
    const { rerender } = render(<DateField id="d" name="d" label="Quando" type="datetime-local" />);
    expect(screen.getByLabelText("Quando")).toHaveAttribute("type", "datetime-local");
    rerender(<DateField id="d" name="d" label="Quando" type="time" />);
    expect(screen.getByLabelText("Quando")).toHaveAttribute("type", "time");
  });

  it("com erro e dica: aria-invalid e os dois ids", () => {
    render(<DateField id="d" name="d" label="Data" hint="dd/mm/aaaa" error="Data inválida" />);
    const el = screen.getByLabelText("Data");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(el).toHaveAttribute("aria-describedby", "d-dica d-erro");
    expect(document.getElementById("d-erro")).toHaveTextContent("Data inválida");
  });

  it("onChange recebe o valor", () => {
    const onChange = vi.fn();
    render(<DateField id="d" name="d" label="Data" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Data"), { target: { value: "2026-10-04" } });
    expect(onChange).toHaveBeenCalledWith("2026-10-04");
  });
});
