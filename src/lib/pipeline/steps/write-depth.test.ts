import { citedParagraphs, WRITE_TASK } from "./write";

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
});
