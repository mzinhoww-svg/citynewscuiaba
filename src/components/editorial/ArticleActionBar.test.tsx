import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../ui/Button";
import { ArticleActionBar } from "./ArticleActionBar";

describe("ArticleActionBar", () => {
  it("destaca Salvar e mantém as demais ações com nome acessível", () => {
    render(<ArticleActionBar />);
    const bar = screen.getByRole("toolbar", { name: "Ações da matéria" });
    const save = within(bar).getByRole("button", { name: "Salvar" });
    expect(save).toHaveAttribute("data-emphasis", "primary");
    for (const name of ["Compartilhar", "Ajustar leitura", "Útil", "Informar problema"]) {
      expect(within(bar).getByRole("button", { name })).not.toHaveAttribute("data-emphasis");
    }
  });

  it("sem curtidas, comentários nem rótulos de origem", () => {
    const { container } = render(<ArticleActionBar saved useful />);
    expect(container.textContent).not.toMatch(/curtid|coment|normalizado|\bIA\b/i);
  });
});

describe("Button collapseLabel", () => {
  it("abaixo de 640 px o texto fica só para leitor de tela, mas o nome acessível permanece", () => {
    render(
      <Button icon="share-2" variant="outline" size="md" collapseLabel>
        Compartilhar
      </Button>,
    );
    const btn = screen.getByRole("button", { name: "Compartilhar" });
    const label = within(btn).getByText("Compartilhar");
    expect(label.className).toContain("max-sm:sr-only");
    expect(btn.className).toContain("max-sm:w-tap");
  });
});
