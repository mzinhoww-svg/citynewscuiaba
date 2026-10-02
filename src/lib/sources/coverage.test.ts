import { describe, expect, it } from "vitest";
import type { AggregatedView } from "@/lib/db/queries/types";
import { buildCoverage, pickActiveTopic } from "./coverage";

function item(id: string, sourceSlug: string, publishedAt: string | null): AggregatedView {
  return {
    id,
    title: `Item ${id}`,
    url: `https://${sourceSlug}.example/${id}`,
    sourceName: sourceSlug.toUpperCase(),
    sourceSlug,
    publishedAt,
    summary: null,
    sectionSlug: "cidade",
    topicId: "t1",
    labels: { shown: [], hidden: [] },
  };
}

describe("Comparar coberturas (P16)", () => {
  const sources = ["fc", "db", "ma", "pv"].map((slug) => ({ slug, name: slug.toUpperCase() }));

  it("colunas por veículo com contagem, último item e diferença para a primeira publicação", () => {
    const c = buildCoverage(
      [
        item("1", "fc", "2026-09-25T10:00:00Z"),
        item("2", "fc", "2026-09-25T15:00:00Z"),
        item("3", "db", "2026-09-25T13:30:00Z"),
      ],
      sources,
    );
    expect(c.covered.map((x) => [x.slug, x.count, x.latest.id, x.hoursAfterFirst])).toEqual([
      ["fc", 2, "2", 0],
      ["db", 1, "3", 3],
    ]);
    expect(c.missing.map((m) => m.slug)).toEqual(["ma", "pv"]);
  });

  it("item sem data não quebra a diferença", () => {
    const c = buildCoverage([item("1", "ma", null)], sources);
    expect(c.covered[0]!.hoursAfterFirst).toBe(0);
  });

  it("assunto mais ativo: mais veículos, depois o mais recente", () => {
    const t = (id: string, sourceCount: number, updatedAt: string) => ({
      id,
      sourceCount,
      updatedAt,
    });
    expect(
      pickActiveTopic([
        t("a", 2, "2026-09-26T10:00:00Z"),
        t("b", 4, "2026-09-20T10:00:00Z"),
        t("c", 4, "2026-09-25T10:00:00Z"),
      ])?.id,
    ).toBe("c");
    expect(pickActiveTopic([t("a", 1, "2026-09-26T10:00:00Z")])).toBeNull();
  });
});
