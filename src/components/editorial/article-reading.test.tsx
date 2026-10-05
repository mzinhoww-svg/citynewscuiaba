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
  const article = { kind: "normalized" as const, sourceCount: 2 };
  it("com collapsible, o conteúdo fica em <details> com resumo 'De onde veio'", () => {
    const { container } = render(<MadeHow article={article} versionsHref="/x" collapsible />);
    expect(container.querySelector("details > summary")).toHaveTextContent("De onde veio");
    // Versão para o desktop (aberta, escolhida por CSS) vem no mesmo HTML.
    expect(screen.getAllByRole("region", { name: "De onde veio" })).toHaveLength(2);
  });
  it("com collapsible, Informar problema fica visível no celular, fora do <details> (UX item 74)", () => {
    const { container } = render(
      <MadeHow
        article={article}
        versionsHref="/x"
        collapsible
        report={<button type="button">Informar problema</button>}
      />,
    );
    const details = container.querySelector("details")!;
    expect(details.querySelector("button")).toBeNull();
    // Uma entrada por largura: a do celular (fora do <details>) e a do painel do desktop.
    const regions = screen.getAllByRole("region", { name: "De onde veio" });
    for (const r of regions)
      expect(within(r).getAllByRole("button", { name: "Informar problema" })).toHaveLength(1);
  });
  it("sem collapsible, não usa <details>", () => {
    const { container } = render(<MadeHow article={article} versionsHref="/x" />);
    expect(container.querySelector("details")).toBeNull();
  });
});

describe("AiSummaryBlock", () => {
  it("chama-se 'Resumo em poucos segundos', sem rótulo de IA nem rodapé de revisão", () => {
    const { container } = render(<AiSummaryBlock items={["A", "B"]} />);
    expect(screen.getByRole("heading", { name: "Resumo em poucos segundos" })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /\bIA\b|inteligência artificial|gerado|revisad|automátic/i,
    );
    expect(screen.getByText("Foi útil?")).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/bg-ia-soft|border-ai|text-ai/);
  });
});
