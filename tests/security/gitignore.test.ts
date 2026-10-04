// @vitest-environment node
// .gitignore deve ignorar todos os .env* exceto .env.example (CLAUDE.md §8).
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe(".gitignore", () => {
  const isIgnored = (path: string): boolean => {
    try {
      execFileSync("git", ["check-ignore", "--no-index", path]);
      return true;
    } catch {
      // Exit code 1 = not ignored
      return false;
    }
  };

  it(".env de produção e desenvolvimento são ignorados e .env.example não", () => {
    // Todos esses devem ser ignorados
    expect(isIgnored(".env.prod")).toBe(true);
    expect(isIgnored(".env.production")).toBe(true);
    expect(isIgnored(".env.development")).toBe(true);
    expect(isIgnored(".env")).toBe(true);

    // Este NÃO deve ser ignorado
    expect(isIgnored(".env.example")).toBe(false);
  });
});
