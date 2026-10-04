import { createUsed } from "@/lib/featured";
import { panoramaForHome, topicsWithCover, type PanoramaRow } from "./home";
import type { ArticleImage, ArticleSummary, TopicView } from "./types";

const photo: ArticleImage = { src: "/api/media/x", alt: "Foto", kind: "original" };
const art = (id: string, topicId: string | null, image?: ArticleImage): ArticleSummary =>
  ({ id, topicId, image, sponsored: false }) as unknown as ArticleSummary;
const topic = (id: string): TopicView => ({ id, title: `Assunto ${id}` }) as unknown as TopicView;

describe("Assuntos em destaque (R40)", () => {
  it("a matéria candidata a manchete e a assunto aparece uma vez só", () => {
    const used = createUsed();
    const lead = art("a1", "t1", photo);
    used.add(lead);
    const pool = [lead, art("a2", "t2", photo)];
    const out = topicsWithCover([topic("t1"), topic("t2")], pool, used, 3);
    expect(out.map((t) => t.id)).toEqual(["t2"]);
  });

  it("assunto sem capa aprovada fica fora; com capa, o card traz a foto", () => {
    const used = createUsed();
    const pool = [art("b1", "t3"), art("b2", "t4", photo)];
    const out = topicsWithCover([topic("t3"), topic("t4")], pool, used, 3);
    expect(out.map((t) => t.id)).toEqual(["t4"]);
    expect(out[0]!.cover).toEqual(photo);
  });

  it("reprodução sem crédito não vale como capa", () => {
    const used = createUsed();
    const pool = [art("c1", "t5", { src: "/x", alt: "", kind: "reproduction" })];
    expect(topicsWithCover([topic("t5")], pool, used, 3)).toEqual([]);
  });

  it("registra a matéria de capa: o módulo seguinte não a repete", () => {
    const used = createUsed();
    const pool = [art("d1", "t6", photo)];
    topicsWithCover([topic("t6")], pool, used, 3);
    expect(used.hasArticle("d1")).toBe(true);
    expect(used.takeArticles(pool, 3)).toEqual([]);
  });

  it("sem assunto elegível devolve vazio (o módulo some)", () => {
    expect(topicsWithCover([topic("t7")], [], createUsed(), 3)).toEqual([]);
  });
});

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
