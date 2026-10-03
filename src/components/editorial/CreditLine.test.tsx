import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CreditLine } from "./CreditLine";

describe("CreditLine", () => {
  it("'Com informações de {fonte}' com link para o original em nova aba", () => {
    const { container } = render(
      <CreditLine
        text="Com informações de MT Agora"
        sources={[{ name: "MT Agora", url: "https://mtagora.example/a" }]}
      />,
    );
    expect(container).toHaveTextContent("Com informações de MT Agora");
    const link = screen.getByRole("link", { name: "MT Agora" });
    expect(link).toHaveAttribute("href", "https://mtagora.example/a");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("várias fontes: vírgula e 'e'", () => {
    const { container } = render(
      <CreditLine
        text="x"
        sources={[
          { name: "A", url: "https://a.example" },
          { name: "B", url: "https://b.example" },
          { name: "C", url: "https://c.example" },
        ]}
      />,
    );
    expect(container).toHaveTextContent("Com informações de A, B e C");
  });

  it("sem link válido mostra o texto simples, sem esquema perigoso", () => {
    const { container } = render(
      <CreditLine
        text="Com informações de X"
        sources={[{ name: "X", url: "javascript:alert(1)" }]}
      />,
    );
    expect(container).toHaveTextContent("Com informações de X");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
