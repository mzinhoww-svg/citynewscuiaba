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
    for (const s of ["article.card", "a", "h2", "time", "div > a.link", "#main .item a"]) {
      expect(isSafeSelector(s)).toBe(true);
    }
  });

  // FS-T4 fix round 1 (review): gramática de permissão explícita, um caso por recusa exigida.
  it("recusa seletor universal (*)", () => {
    expect(isSafeSelector("*")).toBe(false);
    expect(isSafeSelector("article *")).toBe(false);
  });
  it("recusa pseudo-classe e pseudo-elemento (:has, :not, :is, :where…)", () => {
    for (const s of ["div:has(a:has(b))", "a:not(.x)", ":is(h2, h3)", "a::before", "a:hover"]) {
      expect(isSafeSelector(s)).toBe(false);
    }
  });
  it("recusa seletor de atributo", () => {
    expect(isSafeSelector('a[href^="javascript:"]')).toBe(false);
    expect(isSafeSelector("a[href]")).toBe(false);
  });
  it("recusa lista de seletores (vírgula)", () => {
    expect(isSafeSelector("a, b")).toBe(false);
  });
  it("recusa combinador de irmãos (~, +)", () => {
    expect(isSafeSelector("h2 ~ p")).toBe(false);
    expect(isSafeSelector("h2 + p")).toBe(false);
  });
  it("recusa string entre aspas e escape com barra invertida", () => {
    expect(isSafeSelector('a[title="x"]')).toBe(false);
    expect(isSafeSelector("a\\.b")).toBe(false);
  });
  it("recusa seletor com mais de 120 caracteres", () => {
    expect(isSafeSelector("a".repeat(500))).toBe(false);
    expect(isSafeSelector("a".repeat(120))).toBe(true);
    expect(isSafeSelector("a".repeat(121))).toBe(false);
  });
  it("recusa mais de 3 partes compostas", () => {
    expect(isSafeSelector("#main .item a")).toBe(true);
    expect(isSafeSelector("#main .item a span")).toBe(false);
    expect(isSafeSelector("a > b > c")).toBe(true);
    expect(isSafeSelector("a > b > c > d")).toBe(false);
  });
});
