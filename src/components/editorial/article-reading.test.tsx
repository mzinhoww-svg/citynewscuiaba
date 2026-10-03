import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ArticleSource } from "@/lib/db/queries/types";
import { AiSummaryBlock } from "./AiSummaryBlock";
import { MadeHow } from "./MadeHow";
import { SourcesList } from "./SourcesList";

const sources: ArticleSource[] = [
  {
    name: "Folha do Cerrado",
    sourceSlug: "folha-do-cerrado",
    role: "primary",
    confirmed: true,
    url: "https://folhadocerrado.example/a",
    title: "Prefeitura detalha plano",
    publishedAt: "2026-09-26T12:00:00Z",
  },
];

describe("SourcesList em <details>", () => {
  it("vem recolhida, com o título 'Fontes' e a contagem no resumo", async () => {
    const { container } = render(<SourcesList sources={sources} />);
    const details = container.querySelector("details")!;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    const region = screen.getByRole("region", { name: /Fontes/ });
    expect(within(region).getByRole("heading", { name: /Fontes/ })).toBeInTheDocument();
    await userEvent.click(container.querySelector("summary")!);
    expect(details.open).toBe(true);
    expect(within(region).getByRole("link", { name: /Prefeitura detalha plano/ })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("apuração própria sem fontes continua visível", () => {
    render(<SourcesList sources={[]} ownReporting />);
    expect(screen.getByText(/Apuração própria/)).toBeVisible();
  });
});

describe("MadeHow recolhível", () => {
  const article = { kind: "normalized" as const, sourceCount: 2, publishMode: "auto" as const };
  it("com collapsible, o conteúdo fica em <details> com resumo 'Como esta matéria foi feita'", () => {
    const { container } = render(<MadeHow article={article} versionsHref="/x" collapsible />);
    expect(container.querySelector("details > summary")).toHaveTextContent(
      "Como esta matéria foi feita",
    );
    // Versão para o desktop (aberta, escolhida por CSS) vem no mesmo HTML.
    expect(screen.getAllByRole("region", { name: "Como esta matéria foi feita" })).toHaveLength(2);
  });
  it("sem collapsible, não usa <details>", () => {
    const { container } = render(<MadeHow article={article} versionsHref="/x" />);
    expect(container.querySelector("details")).toBeNull();
  });
});

describe("AiSummaryBlock", () => {
  it("chama-se 'Resumo em poucos segundos' e não usa rótulo de IA", () => {
    const { container } = render(<AiSummaryBlock items={["A", "B"]} reviewer="Marina Arruda" />);
    expect(screen.getByRole("heading", { name: "Resumo em poucos segundos" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bIA\b|inteligência artificial|gerado/i);
    expect(container.innerHTML).not.toMatch(/bg-ia-soft|border-ai|text-ai/);
  });
});
