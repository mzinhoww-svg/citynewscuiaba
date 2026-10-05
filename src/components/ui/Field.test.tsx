import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { describedBy, FieldShell } from "./Field";

describe("describedBy", () => {
  it("sem dica nem erro devolve undefined", () => {
    expect(describedBy("x")).toBeUndefined();
  });

  it("junta dica e erro na ordem", () => {
    expect(describedBy("x", "dica", "erro")).toBe("x-dica x-erro");
    expect(describedBy("x", undefined, "erro")).toBe("x-erro");
    expect(describedBy("x", "dica", null)).toBe("x-dica");
  });
});

describe("FieldShell", () => {
  it("liga o rótulo ao controle e mostra dica e erro com os ids esperados", () => {
    render(
      <FieldShell id="nome" label="Nome" hint="Como aparece no site" error="Informe o nome">
        <input id="nome" aria-describedby={describedBy("nome", "h", "e")} aria-invalid />
      </FieldShell>,
    );
    const input = screen.getByLabelText("Nome");
    expect(input).toHaveAttribute("aria-describedby", "nome-dica nome-erro");
    expect(document.getElementById("nome-dica")).toHaveTextContent("Como aparece no site");
    const erro = document.getElementById("nome-erro");
    expect(erro).toHaveTextContent("Informe o nome");
    expect(erro?.querySelector("svg")).not.toBeNull();
  });

  it("mostra o conteúdo ao lado do rótulo", () => {
    render(
      <FieldShell id="a" label="Apelido" aside={<span>opcional</span>}>
        <input id="a" />
      </FieldShell>,
    );
    expect(screen.getByText("opcional")).toBeInTheDocument();
  });
});
