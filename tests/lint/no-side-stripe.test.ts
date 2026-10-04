import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Item 44 da spec de melhorias: sem faixa lateral grossa (selo ou ícone no lugar), cor única do
// checkbox pelo token e ícones só com cor por classe.
const root = process.cwd();
const src = join(root, "src");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(tsx?|css)$/.test(e.name) ? [p] : [];
  });
}

const sources = files(src).map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") }));

function offenders(pattern: RegExp): string[] {
  return sources
    .filter((f) => !f.path.endsWith(".test.ts") && !f.path.endsWith(".test.tsx"))
    .flatMap((f) =>
      f.text.split("\n").flatMap((line, i) => (pattern.test(line) ? [`${f.path}:${i + 1}`] : [])),
    );
}

describe("detalhes visuais (item 44)", () => {
  it("nenhuma borda lateral grossa (border-l/border-s de 3 px ou mais)", () => {
    expect(offenders(/\bborder-[ls]-(?:[3-9]|\d{2,}|\[)/)).toEqual([]);
  });

  it("checkbox usa o token direto (accent-(--action-primary))", () => {
    expect(offenders(/\baccent-action-primary\b/)).toEqual([]);
  });

  it("ícone não recebe cor inline por var(--…); a cor vem de classe text-*", () => {
    expect(offenders(/<Icon\b[^>]*\bcolor="var\(/)).toEqual([]);
  });
});
