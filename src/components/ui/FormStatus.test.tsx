import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormStatus } from "./FormStatus";

describe("FormStatus (item 39)", () => {
  it("mensagem vazia continua no DOM (região viva sempre montada)", () => {
    const { container } = render(<FormStatus id="conta-status" tone="success" message="" />);
    const el = container.querySelector("#conta-status");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("role", "status");
    expect(el).toBeEmptyDOMElement();
    expect(el?.className).toContain("empty:hidden");
  });

  it("sucesso e info anunciam com role=status", () => {
    render(<FormStatus tone="success" message="Preferências salvas." />);
    expect(screen.getByRole("status")).toHaveTextContent("Preferências salvas.");
  });

  it("erro anuncia com role=alert", () => {
    render(<FormStatus tone="error" message="Não foi possível salvar." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível salvar.");
  });

  it("trocar a mensagem não remonta o contêiner", () => {
    const { container, rerender } = render(<FormStatus id="s" tone="info" message="" />);
    const before = container.querySelector("#s");
    rerender(<FormStatus id="s" tone="info" message="Enviando" />);
    expect(container.querySelector("#s")).toBe(before);
    expect(before).toHaveTextContent("Enviando");
  });
});
