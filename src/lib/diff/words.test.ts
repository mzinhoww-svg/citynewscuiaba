import { diffWords } from "./words";

it("marca palavra trocada como remoção e adição", () => {
  expect(diffWords("dura 18 minutos", "dura 20 minutos")).toEqual([
    { type: "same", text: "dura " },
    { type: "del", text: "18" },
    { type: "add", text: "20" },
    { type: "same", text: " minutos" },
  ]);
});
it("texto igual vira um trecho só", () => {
  expect(diffWords("a b c", "a b c")).toEqual([{ type: "same", text: "a b c" }]);
});
it("adição no fim e texto vazio", () => {
  expect(diffWords("a", "a b")).toEqual([
    { type: "same", text: "a" },
    { type: "add", text: " b" },
  ]);
  expect(diffWords("", "novo")).toEqual([{ type: "add", text: "novo" }]);
  expect(diffWords("velho", "")).toEqual([{ type: "del", text: "velho" }]);
});
