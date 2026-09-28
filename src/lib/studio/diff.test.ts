import { diffText, versionDiff } from "./diff";

it("diff por palavra marca o número trocado", () => {
  expect(diffText("de 55 para 37 minutos", "de 55 para 35 minutos")).toEqual([
    { op: "eq", text: "de 55 para " },
    { op: "del", text: "37" },
    { op: "add", text: "35" },
    { op: "eq", text: " minutos" },
  ]);
});

it("texto igual e textos vazios", () => {
  expect(diffText("igual", "igual")).toEqual([{ op: "eq", text: "igual" }]);
  expect(diffText("", "novo")).toEqual([{ op: "add", text: "novo" }]);
  expect(diffText("velho", "")).toEqual([{ op: "del", text: "velho" }]);
  expect(diffText("", "")).toEqual([]);
});

it("compara duas versões campo a campo e diz quais mudaram", () => {
  const doc = (t: string) => ({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
  });
  const d = versionDiff(
    { title: "Título", dek: "Linha", body: doc("Aula dura 18 minutos.") },
    { title: "Título", dek: "Linha fina", body: doc("Aula dura 20 minutos.") },
  );
  expect(d.changed).toEqual(["dek", "body"]);
  expect(d.fields.title).toEqual([{ op: "eq", text: "Título" }]);
  expect(d.fields.body).toContainEqual({ op: "add", text: "20" });
});
