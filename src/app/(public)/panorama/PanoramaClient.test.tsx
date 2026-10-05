import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AggregatedView } from "@/lib/db/queries/types";
import { PanoramaClient } from "./PanoramaClient";

/* UX-W4-T4 (item 73): ordenação com nome honesto, botão no vazio e resumo no seletor. */

vi.mock("@/lib/anon/use-profile", () => ({
  useAnonProfile: () => ({ profile: null, ready: true, degraded: false, act: vi.fn() }),
}));

const SOURCES = [
  { slug: "folha-do-cerrado", name: "Folha do Cerrado", popularity: 10 },
  { slug: "mt-agora", name: "MT Agora", popularity: 5 },
  { slug: "diario-do-rio", name: "Diário do Rio", popularity: 1 },
];

const item = (id: string, sourceSlug: string): AggregatedView => ({
  id,
  title: `Matéria ${id}`,
  url: `https://exemplo.test/${id}`,
  sourceName: SOURCES.find((s) => s.slug === sourceSlug)?.name ?? sourceSlug,
  sourceSlug,
  publishedAt: "2026-10-04T12:00:00Z",
  summary: null,
  sectionSlug: null,
  topicId: null,
  labels: { shown: [], hidden: [] },
});

const ITEMS = [item("a", "folha-do-cerrado"), item("b", "mt-agora")];

describe("PanoramaClient (UX-W4-T4, item 73)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("a ordenação por popularidade diz que ordena fontes", () => {
    render(<PanoramaClient items={ITEMS} sources={SOURCES} />);
    expect(screen.getByRole("radio", { name: "Fontes mais lidas primeiro" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Mais lidas" })).toBeNull();
  });

  it("o resumo do seletor diz quantas fontes estão exibidas", async () => {
    render(<PanoramaClient items={ITEMS} sources={SOURCES} />);
    const summary = screen.getByText("Fontes exibidas").closest("summary")!;
    expect(summary).toHaveTextContent("3 de 3 fontes");
    await userEvent.click(summary);
    await userEvent.click(screen.getByRole("checkbox", { name: "MT Agora" }));
    expect(summary).toHaveTextContent("2 de 3 fontes");
  });

  it("vazio: botão Mostrar todas volta a exibir todas as fontes", async () => {
    window.localStorage.setItem(
      "cn:panorama:fontes",
      JSON.stringify({ mode: "custom", slugs: ["diario-do-rio"] }),
    );
    render(<PanoramaClient items={ITEMS} sources={SOURCES} />);
    expect(screen.getByText("Nenhum item das fontes escolhidas")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mostrar todas" }));
    expect(screen.queryByText("Nenhum item das fontes escolhidas")).toBeNull();
    expect(screen.getByText("Matéria a")).toBeInTheDocument();
    expect(screen.getByText("Fontes exibidas").closest("summary")).toHaveTextContent(
      "3 de 3 fontes",
    );
  });
});
