import { describe, expect, it } from "vitest";
import { isSafeOrigin, originFrom, withOrigin } from "./origin";

const FALLBACK = "/estudio/fila";

describe("originFrom", () => {
  it("aceita caminho interno do Estúdio com consulta", () => {
    expect(originFrom({ de: "/estudio/fila?aba=mine" }, FALLBACK)).toBe("/estudio/fila?aba=mine");
    expect(originFrom({ de: "/estudio" }, "/estudio/x")).toBe("/estudio");
    expect(originFrom({ de: "/estudio?aba=1" }, FALLBACK)).toBe("/estudio?aba=1");
    expect(originFrom({ de: "/estudio/materias#lista" }, FALLBACK)).toBe("/estudio/materias#lista");
  });

  it("usa o primeiro valor quando o parâmetro se repete", () => {
    expect(originFrom({ de: ["/estudio/midia", "https://mal.example"] }, FALLBACK)).toBe(
      "/estudio/midia",
    );
  });

  it.each([
    "https://mal.example",
    "http://mal.example/estudio",
    "//mal.example/estudio",
    "/\\mal.example",
    "\\\\mal.example",
    "/estudio\\..\\conta",
    "javascript:alert(1)",
    "/estudio-falso",
    "/conta",
    "/",
    "estudio/fila",
    "/estudio/../conta",
    "/estudio/./fila",
    "/estudio/fila\n",
    "/estudio/%2e%2e/conta",
    " /estudio",
    "",
  ])("devolve o fallback para %j", (de) => {
    expect(originFrom({ de }, FALLBACK)).toBe(FALLBACK);
  });

  it("devolve o fallback sem o parâmetro", () => {
    expect(originFrom({}, FALLBACK)).toBe(FALLBACK);
    expect(originFrom({ de: undefined }, FALLBACK)).toBe(FALLBACK);
    expect(originFrom({ de: [] }, FALLBACK)).toBe(FALLBACK);
  });

  it("caminho longo demais não é aceito", () => {
    expect(originFrom({ de: `/estudio/${"a".repeat(2100)}` }, FALLBACK)).toBe(FALLBACK);
  });
});

describe("isSafeOrigin", () => {
  it("só caminhos internos do Estúdio", () => {
    expect(isSafeOrigin("/estudio/fila")).toBe(true);
    expect(isSafeOrigin("//estudio")).toBe(false);
  });
});

describe("withOrigin", () => {
  it("anexa ?de= codificado", () => {
    expect(withOrigin("/estudio/fila/abc", "/estudio/fila?aba=mine&p=2")).toBe(
      "/estudio/fila/abc?de=%2Festudio%2Ffila%3Faba%3Dmine%26p%3D2",
    );
  });

  it("usa & quando o destino já tem consulta e preserva o fragmento", () => {
    expect(withOrigin("/estudio/fila/abc?x=1#acoes", "/estudio/fila")).toBe(
      "/estudio/fila/abc?x=1&de=%2Festudio%2Ffila#acoes",
    );
  });

  it("substitui um de= que já exista", () => {
    expect(withOrigin("/estudio/fila/abc?de=%2Festudio&x=1", "/estudio/fila")).toBe(
      "/estudio/fila/abc?x=1&de=%2Festudio%2Ffila",
    );
  });

  it("ignora origem insegura", () => {
    expect(withOrigin("/estudio/fila/abc", "https://mal.example")).toBe("/estudio/fila/abc");
  });

  it("ida e volta: originFrom recupera a origem anexada", () => {
    const href = withOrigin("/estudio/fila/abc", "/estudio/fila?aba=mine");
    const de = new URL(href, "http://x").searchParams.get("de") ?? undefined;
    expect(originFrom({ de }, "/estudio")).toBe("/estudio/fila?aba=mine");
  });
});
