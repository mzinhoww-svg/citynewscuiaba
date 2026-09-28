import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findTermsLinks } from "./terms";

function read(fixture: string): string {
  return readFileSync(join(process.cwd(), "tests/fixtures", fixture), "utf-8");
}

describe("findTermsLinks", () => {
  it("acha termos de uso do mesmo site", () => {
    expect(findTermsLinks(read("sites/termos.html"), "https://folhadocerrado.example/")).toEqual([
      "https://folhadocerrado.example/termos-de-uso",
    ]);
  });

  it("ignora link de outro site mesmo com texto de termos", () => {
    const html = `<a href="https://outrosite.example/termos">Termos de uso</a>`;
    expect(findTermsLinks(html, "https://folhadocerrado.example/")).toEqual([]);
  });

  it("no máximo 5 links", () => {
    const html = Array.from(
      { length: 8 },
      (_, i) => `<a href="/termos-${i}">Termos de uso ${i}</a>`,
    ).join("");
    expect(findTermsLinks(html, "https://folhadocerrado.example/")).toHaveLength(5);
  });
});
