import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select, SelectControl } from "./Select";

const opts = [
  { value: "a", label: "A" },
  { value: "b", label: "B" },
];

describe("Select", () => {
  it("desabilitado (item 6)", () => {
    render(<Select id="s" name="s" label="Editoria" options={[]} disabled />);
    expect(screen.getByLabelText("Editoria")).toBeDisabled();
  });

  it("habilitado por padrão", () => {
    render(<Select id="s" name="s" label="Editoria" options={[{ value: "a", label: "A" }]} />);
    expect(screen.getByLabelText("Editoria")).toBeEnabled();
  });

  it("com erro: aria-invalid e aria-describedby apontando para a mensagem", () => {
    render(<Select id="s" name="s" label="Editoria" options={opts} error="Escolha uma editoria" />);
    const el = screen.getByLabelText("Editoria");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(el.getAttribute("aria-describedby")).toContain("s-erro");
    expect(document.getElementById("s-erro")).toHaveTextContent("Escolha uma editoria");
  });

  it("com dica e erro: aria-describedby tem os dois ids", () => {
    render(<Select id="s" name="s" label="Editoria" options={opts} hint="Dica" error="Erro" />);
    expect(screen.getByLabelText("Editoria")).toHaveAttribute("aria-describedby", "s-dica s-erro");
  });

  it("groups renderiza optgroup", () => {
    const { container } = render(
      <Select
        id="s"
        name="s"
        label="Fonte"
        groups={[
          { label: "Grupo 1", options: opts },
          { label: "Grupo 2", options: [{ value: "c", label: "C" }] },
        ]}
      />,
    );
    const groups = container.querySelectorAll("optgroup");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAttribute("label", "Grupo 1");
    expect(groups[1]?.querySelectorAll("option")).toHaveLength(1);
  });

  it("sem onChange dentro de form GET envia o valor escolhido", () => {
    render(
      <form method="get" aria-label="filtros">
        <Select id="s" name="editoria" label="Editoria" options={opts} defaultValue="a" />
      </form>,
    );
    fireEvent.change(screen.getByLabelText("Editoria"), { target: { value: "b" } });
    const form = screen.getByRole("form", { name: "filtros" }) as HTMLFormElement;
    expect(new FormData(form).get("editoria")).toBe("b");
  });

  it("controlado chama onChange com o valor", () => {
    const onChange = vi.fn();
    render(
      <Select id="s" name="s" label="Editoria" options={opts} value="a" onChange={onChange} />,
    );
    fireEvent.change(screen.getByLabelText("Editoria"), { target: { value: "b" } });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("opção desabilitada", () => {
    render(
      <Select
        id="s"
        name="s"
        label="Editoria"
        options={[{ value: "a", label: "A", disabled: true }]}
      />,
    );
    expect(screen.getByRole("option", { name: "A" })).toBeDisabled();
  });

  it("size sm usa a altura de alvo de toque e md a altura de campo", () => {
    const { container, rerender } = render(
      <Select id="s" name="s" label="Editoria" options={opts} size="sm" />,
    );
    expect(container.querySelector(".control-field")).toHaveClass("h-tap");
    rerender(<Select id="s" name="s" label="Editoria" options={opts} />);
    expect(container.querySelector(".control-field")).toHaveClass("h-input");
  });

  it("SelectControl sem rótulo próprio aceita rótulo externo", () => {
    render(
      <>
        <label htmlFor="t">Tipo</label>
        <SelectControl id="t" name="t" options={opts} />
      </>,
    );
    expect(screen.getByLabelText("Tipo").tagName).toBe("SELECT");
  });
});
