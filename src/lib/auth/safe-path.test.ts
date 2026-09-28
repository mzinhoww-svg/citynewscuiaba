import { describe, expect, it } from "vitest";
import { internalPath } from "./safe-path";

const HOSTILE = [
  "//evil.com",
  "///evil.com",
  "/\\evil.com",
  "\\\\evil.com",
  "/\t/evil.com",
  "/\n/evil.com",
  "/\r/evil.com",
  "/\t\\evil.com",
  "/ /evil.com",
  "/\u0000/evil.com",
  "/\u007f/evil.com",
  "/ /evil.com",
  "/ /evil.com",
  "/%09/evil.com",
  "/%0a/evil.com",
  "/%0D/evil.com",
  "/%5c/evil.com",
  "/%2f/evil.com",
  "/%2F%2Fevil.com",
  "/%252f%252fevil.com",
  "%2F%2Fevil.com",
  "https://evil.com",
  "http:/evil.com",
  "javascript:alert(1)",
  " /materia",
  "materia/x",
  "",
];

describe("internalPath", () => {
  it.each(HOSTILE)("recusa %j", (next) => {
    expect(internalPath(next)).toBeNull();
  });

  it("aceita caminhos internos e devolve caminho + busca + âncora", () => {
    expect(internalPath("/materia/x?y=1#topo")).toBe("/materia/x?y=1#topo");
    expect(internalPath("/busca?q=caf%C3%A9")).toBe("/busca?q=caf%C3%A9");
    expect(internalPath("/")).toBe("/");
  });

  it("normaliza pontos sem sair da origem", () => {
    expect(internalPath("/a/../b")).toBe("/b");
  });

  it("recusa ausente e texto muito longo", () => {
    expect(internalPath(undefined)).toBeNull();
    expect(internalPath(null)).toBeNull();
    expect(internalPath(`/${"a".repeat(2100)}`)).toBeNull();
  });
});
