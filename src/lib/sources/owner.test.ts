import { describe, expect, it } from "vitest";
import { belongsTo, contractedArticle } from "./owner";

describe("Conteúdo pertence a… (P15)", () => {
  it("usa a contração pelo gênero do nome do veículo", () => {
    expect(belongsTo("Folha do Cerrado")).toBe("Conteúdo pertence à Folha do Cerrado");
    expect(belongsTo("Rádio Pantanal")).toBe("Conteúdo pertence à Rádio Pantanal");
    expect(belongsTo("Agência Cerrado (governo fictício)")).toBe(
      "Conteúdo pertence à Agência Cerrado (governo fictício)",
    );
    expect(belongsTo("Diário da Baixada")).toBe("Conteúdo pertence ao Diário da Baixada");
    expect(belongsTo("Portal Várzea")).toBe("Conteúdo pertence ao Portal Várzea");
  });

  it("sem artigo conhecido (sigla, nome próprio), usa 'a' sem contração", () => {
    expect(belongsTo("MT Agora")).toBe("Conteúdo pertence a MT Agora");
    expect(belongsTo("Brasil Hoje")).toBe("Conteúdo pertence a Brasil Hoje");
    expect(contractedArticle("")).toBe("a");
  });
});
