import type { DraftItem } from "../ports";
import { citedParagraphs, materialOf, WRITE_TASK } from "./write";

const src =
  "A Prefeitura de Cuiabá anunciou nesta terça a interdição parcial da avenida do CPA para obras de drenagem";

describe("write: profundidade e título", () => {
  it("o pedido exige corpo longo, contexto e título específico sem engano", () => {
    expect(WRITE_TASK).toMatch(/no mínimo 30 linhas/);
    expect(WRITE_TASK).toMatch(/nunca encha/);
    expect(WRITE_TASK).toMatch(/a resposta tem de estar no texto/);
    expect(WRITE_TASK).toMatch(/Proibido.*você não vai acreditar/s);
  });

  it("descarta parágrafo que copia 8 palavras seguidas da fonte e mantém o reescrito", () => {
    const out = {
      title: "Obra de drenagem fecha parte da avenida do CPA",
      dek: "Interdição parcial muda o trânsito no bairro",
      summary: ["x"],
      body: [
        { text: `${src}, informou o órgão.`, citations: ["a"] },
        {
          text: "Parte da via no CPA ficará fechada por causa de obras de drenagem.",
          citations: ["a"],
        },
      ],
    };
    const r = citedParagraphs(out, new Set(["a"]), [src]);
    expect(r).toHaveLength(1);
    expect(r[0]!.text).toMatch(/ficará fechada/);
  });

  it("o material do redator é o corpo da página quando o feed só trouxe a abertura", () => {
    const item: DraftItem = {
      id: "a",
      sourceId: "s",
      sourceSlug: "folha-do-cerrado",
      reliability: "standard",
      title: "Júri popular julga 15 casos em outubro",
      excerpt: "A Primeira Vara Criminal realiza 15 sessões em outubro.",
      sourceText:
        "A Primeira Vara Criminal realiza 15 sessões em outubro.\nNo dia 8 vão a júri dois acusados de integrar um grupo de extermínio.",
      publishedAt: null,
      sourceName: "Folha do Cerrado",
      canonicalUrl: "https://folhadocerrado.example/juri",
      tags: [],
      sensitive: false,
    };
    expect(materialOf(item)).toContain("grupo de extermínio");
    expect(materialOf(item).startsWith("Júri popular julga 15 casos em outubro\n")).toBe(true);
    expect(materialOf({ ...item, sourceText: null })).toBe(
      "Júri popular julga 15 casos em outubro\nA Primeira Vara Criminal realiza 15 sessões em outubro.",
    );
    expect(materialOf({ ...item, sourceText: undefined, excerpt: null })).toBe(item.title);
  });

  it("nome próprio, órgão e data da fonte não contam como cópia; a redação copiada continua caindo", () => {
    const fonte =
      "No dia 8 de outubro será o julgamento de Jefferson Fátimo da Silva e Claudiomar Garcia de Carvalho, que pertenciam a um grupo de extermínio. Eles estão custodiados na Penitenciária Central do Estado (PCE). As pautas analisam processos relativos a crimes dolosos contra a vida.";
    const out = {
      title: "Júri julga acusados de grupo de extermínio",
      dek: "Sessões ocorrem em outubro",
      summary: ["x"],
      body: [
        {
          text: "Vão a júri no dia 8 Jefferson Fátimo da Silva e Claudiomar Garcia de Carvalho, apontados como integrantes do grupo.",
          citations: ["a"],
        },
        {
          text: "Os dois seguem presos na Penitenciária Central do Estado (PCE).",
          citations: ["a"],
        },
        {
          text: "Segundo a fonte, eles pertenciam a um grupo de extermínio que agia na região.",
          citations: ["a"],
        },
        {
          text: "As sessões analisam processos relativos a crimes dolosos contra a vida.",
          citations: ["a"],
        },
      ],
    };
    const r = citedParagraphs(out, new Set(["a"]), [fonte]);
    expect(r.map((p) => p.text.slice(0, 12))).toEqual([
      "Vão a júri n",
      "Os dois segu",
      "Segundo a fo",
    ]);
  });
});
