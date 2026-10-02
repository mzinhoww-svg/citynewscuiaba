import { groupRefs, parseContentRef } from "./refs";

describe("parseContentRef", () => {
  it("lê matéria, assunto, evento e agregado", () => {
    const id = "c2000000-0000-4000-8000-000000000001";
    expect(parseContentRef(`article:${id}`)).toEqual({ kind: "article", id });
    expect(parseContentRef(`topic:${id}`)).toEqual({ kind: "topic", id });
    expect(parseContentRef(`event:${id}`)).toEqual({ kind: "event", id });
    expect(parseContentRef(`aggregated:${id}`)).toEqual({ kind: "aggregated", id });
  });

  it("recusa tipo desconhecido e id que não é uuid", () => {
    expect(parseContentRef("video:c2000000-0000-4000-8000-000000000001")).toBeNull();
    expect(parseContentRef("article:1; drop table")).toBeNull();
    expect(parseContentRef("article")).toBeNull();
  });
});

describe("groupRefs", () => {
  it("agrupa ids por tipo e ignora referências inválidas", () => {
    const a = "c2000000-0000-4000-8000-000000000001";
    const e = "c6000000-0000-4000-8000-000000000001";
    expect(groupRefs([`article:${a}`, `event:${e}`, "x:1"])).toEqual({
      article: [a],
      topic: [],
      event: [e],
      aggregated: [],
    });
  });
});
