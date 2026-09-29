import { panoramaForHome, type PanoramaRow } from "./home";

const row = (id: string, slug: string, publishedAt: string, score: number | null): PanoramaRow => ({
  id,
  original_title: `Título ${id}`,
  canonical_url: `https://${slug}.example/${id}`,
  source_name: slug,
  source_slug: slug,
  published_at: publishedAt,
  summary: null,
  section_slug: "cidades",
  topic_id: null,
  source_editorial_score: score,
});

describe("Veja também em outros portais (D-F9)", () => {
  it("exclui fonte com score editorial 1, desempata por score e mostra um item por fonte", () => {
    const rows = [
      row("a1", "baixa", "2026-09-27T14:00:00Z", 1),
      row("b1", "media", "2026-09-27T13:00:00Z", 3),
      row("c1", "alta", "2026-09-27T13:00:00Z", 5),
      row("c2", "alta", "2026-09-27T12:00:00Z", 5),
      row("d1", "sem-score", "2026-09-27T11:00:00Z", null),
    ];
    expect(panoramaForHome(rows, 4).map((v) => v.id)).toEqual(["c1", "b1", "d1"]);
    expect(panoramaForHome(rows, 2).map((v) => v.id)).toEqual(["c1", "b1"]);
  });
});
