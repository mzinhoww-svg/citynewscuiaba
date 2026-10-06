import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Item 91 (T-18): e2e sem espera fixa. Toda espera é por condição (`expect.poll`,
// `waitForResponse`, asserção de UI, quadros da página): a busca por `NEEDLE` em tests/ fica vazia.
const root = process.cwd();
const NEEDLE = ["waitFor", "Timeout"].join("");

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path));
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

describe("e2e sem espera fixa", () => {
  it(`nenhum arquivo em tests/ usa ${NEEDLE}`, () => {
    const hits = files(join(root, "tests")).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${relative(root, path)}:${i + 1}` }))
        .filter(({ line }) => line.includes(NEEDLE))
        .map(({ at }) => at),
    );
    expect(hits).toEqual([]);
  });
});
