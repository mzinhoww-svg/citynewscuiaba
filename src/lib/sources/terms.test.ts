import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findTermsLinks } from "./terms";

const site = (n: string) => readFileSync(join(process.cwd(), "tests/fixtures/sites", n), "utf8");

describe("findTermsLinks", () => {
  it("acha termos de uso do mesmo site, sem fragmento", () =>
    expect(findTermsLinks(site("termos.html"), "https://folhadocerrado.example/")).toEqual([
      "https://folhadocerrado.example/termos-de-uso",
    ]));
  it("acha os termos no rodapé da home e ignora o resto", () =>
    expect(findTermsLinks(site("folha-home.html"), "https://folhadocerrado.example/")).toEqual([
      "https://folhadocerrado.example/termos-de-uso",
    ]));
  it("limita a 5 e não repete", () => {
    const links = Array.from(
      { length: 8 },
      (_, i) => `<a href="/t${i}">Política de uso ${i}</a><a href="/t${i}">Copyright</a>`,
    ).join("");
    const r = findTermsLinks(`<body>${links}</body>`, "https://x.example/");
    expect(r).toHaveLength(5);
    expect(new Set(r).size).toBe(5);
  });
  it("HTML inválido não lança", () =>
    expect(findTermsLinks("<<<", "https://x.example/")).toEqual([]));
});
