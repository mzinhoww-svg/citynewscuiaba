import { describe, expect, it } from "vitest";
import { createUsed } from "./used";

const art = (id: string, topicId: string | null = null) => ({ id, topicId });

describe("createUsed (R40: já exibidos na renderização)", () => {
  it("takeArticles pula o que já foi exibido e registra o que entrou", () => {
    const used = createUsed();
    used.add(art("a", "t1"));
    const out = used.takeArticles([art("a"), art("b"), art("c"), art("d")], 2);
    expect(out.map((x) => x.id)).toEqual(["b", "c"]);
    expect(used.hasArticle("b")).toBe(true);
    expect(used.hasArticle("d")).toBe(false);
  });

  it("filtro opcional (ex.: exige capa) entra antes do registro", () => {
    const used = createUsed();
    const out = used.takeArticles(
      [
        { ...art("a"), cover: false },
        { ...art("b"), cover: true },
      ],
      3,
      (x) => x.cover,
    );
    expect(out.map((x) => x.id)).toEqual(["b"]);
    expect(used.hasArticle("a")).toBe(false);
  });

  it("assunto: não repete assunto já exibido nem matéria já exibida", () => {
    const used = createUsed();
    used.add(art("lead", "t1"));
    const topics = [
      { id: "t1", cover: art("lead", "t1") },
      { id: "t2", cover: art("x", "t2") },
      { id: "t3", cover: art("lead", "t3") },
      { id: "t4", cover: art("y", "t4") },
    ];
    const out = used.takeTopics(topics, 3, (t) => t.cover);
    expect(out.map((t) => t.id)).toEqual(["t2", "t4"]);
    expect(used.hasTopic("t2")).toBe(true);
    expect(used.hasArticle("x")).toBe(true);
  });

  it("assunto sem capa elegível (cover ausente) fica fora", () => {
    const used = createUsed();
    const out = used.takeTopics([{ id: "t1", cover: null }], 3, (t) => t.cover);
    expect(out).toEqual([]);
  });

  it("matéria da mesma pauta exibida acima bloqueia o assunto (manchete = assunto)", () => {
    const used = createUsed();
    used.add(art("manchete", "t9"));
    expect(used.takeTopics([{ id: "t9", cover: art("outra", "t9") }], 3, (t) => t.cover)).toEqual(
      [],
    );
  });
});
