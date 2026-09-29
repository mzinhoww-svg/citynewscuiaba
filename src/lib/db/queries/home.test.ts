import { describe, expect, it } from "vitest";
import { pickHomeAggregated } from "./home";

const row = (
  slug: string,
  publishedAt: string,
  score: number | null,
  id = `${slug}-${publishedAt}`,
) => ({
  id,
  original_title: `Título ${id}`,
  canonical_url: `https://${slug}.example/materia/${id}`,
  source_name: slug,
  source_slug: slug,
  published_at: publishedAt,
  summary: null,
  section_slug: null,
  topic_id: null,
  source_editorial_score: score,
});

describe("Veja também em outros portais", () => {
  it("exclui fonte de score 1 e mantém um item por veículo", () => {
    const out = pickHomeAggregated(
      [
        row("mt-agora", "2026-09-27T12:00:00Z", 1),
        row("folha-do-cerrado", "2026-09-27T11:00:00Z", 4, "a"),
        row("folha-do-cerrado", "2026-09-27T10:00:00Z", 4, "b"),
        row("diario-da-baixada", "2026-09-27T09:00:00Z", 2),
      ],
      4,
    );
    expect(out.map((v) => v.sourceSlug)).toEqual(["folha-do-cerrado", "diario-da-baixada"]);
    expect(out[0]?.id).toBe("a");
  });

  it("empate de horário fica com a fonte de maior score", () => {
    const out = pickHomeAggregated(
      [row("a", "2026-09-27T10:00:00Z", 2), row("b", "2026-09-27T10:00:00Z", 5)],
      4,
    );
    expect(out.map((v) => v.sourceSlug)).toEqual(["b", "a"]);
  });

  it("respeita o limite", () => {
    const rows = ["a", "b", "c", "d", "e"].map((s, i) => row(s, `2026-09-27T1${i}:00:00Z`, 3));
    expect(pickHomeAggregated(rows.reverse(), 4)).toHaveLength(4);
  });
});
