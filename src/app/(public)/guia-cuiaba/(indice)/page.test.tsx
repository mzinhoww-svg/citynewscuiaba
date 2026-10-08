import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArticleSummary } from "@/lib/db/queries/types";

const listGuideLists = vi.fn();
const listSection = vi.fn();
vi.mock("@/lib/db/queries/guide", () => ({ listGuideLists: () => listGuideLists() }));
vi.mock("@/lib/db/queries", () => ({
  listSection: (...args: unknown[]) => listSection(...args),
}));

const { default: GuideIndexPage } = await import("./page");

const article = (i: number): ArticleSummary => ({
  id: `a${i}`,
  slug: `materia-${i}`,
  href: `/materia/materia-${i}`,
  kind: "original",
  title: `Matéria do Guia ${i}`,
  dek: "Roteiro de fim de semana em Cuiabá.",
  section: { slug: "guia-cuiaba", name: "Guia Cuiabá" },
  status: "published",
  publishedAt: "2026-10-04T12:00:00Z",
  updatedAt: "2026-10-04T12:00:00Z",
  labels: { shown: [], hidden: [] },
  confidence: { score: 0.9 },
  sourceCount: 1,
  readMinutes: 2,
  aiSummary: [],
  byline: "Redação CityNews",
  reviewer: undefined,
  topicId: null,
  urgent: false,
  urgentStrip: false,
  sponsored: false,
});

describe("/guia-cuiaba sem listas", () => {
  beforeEach(() => {
    listGuideLists.mockResolvedValue({ ok: true, value: { editorial: [], sponsored: [] } });
  });

  it("mostra as matérias recentes do Guia em vez de só uma caixa de aviso", async () => {
    listSection.mockResolvedValue({
      ok: true,
      value: { articles: Array.from({ length: 9 }, (_, i) => article(i + 1)) },
    });
    render(await GuideIndexPage());
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "As primeiras listas do Guia chegam em breve",
      }),
    ).toBeVisible();
    const list = screen.getByRole("list", { name: "Matérias do Guia" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(within(list).getByRole("link", { name: /Matéria do Guia 1/ })).toBeVisible();
    expect(listSection).toHaveBeenCalledWith("guia-cuiaba", {}, 1);
  });

  it("sem matérias, aponta o link do cabeçalho e não deixa lista vazia", async () => {
    listSection.mockResolvedValue({ ok: true, value: { articles: [] } });
    render(await GuideIndexPage());
    expect(screen.queryByRole("list", { name: "Matérias do Guia" })).toBeNull();
    expect(screen.getByRole("link", { name: "Matérias do Guia" })).toHaveAttribute(
      "href",
      "/guia-cuiaba/materias",
    );
  });
});
