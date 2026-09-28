import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPageList, isSafeSelector } from "./page-list";

function read(fixture: string): string {
  return readFileSync(join(process.cwd(), "tests/fixtures", fixture), "utf-8");
}

describe("extractPageList", () => {
  it("extrai por seletor só links do mesmo site", () => {
    const items = extractPageList(
      read("sites/secao-mt-agora.html"),
      "https://mtagora.example/cidades",
      {
        item: "article.card",
        link: "a",
        title: "h2",
        date: "time",
      },
    );
    expect(items).toHaveLength(3);
    expect(items.every((i) => new URL(i.url).hostname === "mtagora.example")).toBe(true);
    expect(items[0]).toMatchObject({
      excerpt: null,
      author: null,
      imageUrl: null,
      injection: false,
    });
    expect(items[0]?.publishedAt).toBe("2026-09-27T10:00:00.000Z");
  });

  it("seletor inseguro não extrai nada", () => {
    expect(
      extractPageList(read("sites/secao-mt-agora.html"), "https://mtagora.example/cidades", {
        item: "<script>",
        link: "a",
        title: "h2",
      }),
    ).toEqual([]);
  });
});

describe("isSafeSelector", () => {
  it("recusa seletor perigoso", () => {
    for (const s of ["<script>", "a{x}", "@import", "a".repeat(201)]) {
      expect(isSafeSelector(s)).toBe(false);
    }
  });
  it("aceita seletores CSS simples", () => {
    for (const s of ["article.card", "a", "h2", "time", "div > a.link"]) {
      expect(isSafeSelector(s)).toBe(true);
    }
  });
});
