// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * zod fora do JavaScript do navegador (item 85 da spec de melhorias, UX-W5-T5; A-154).
 *
 * Duas guardas:
 * 1. Estática (sempre roda): a partir de todo arquivo "use client", inclusive os do Estúdio,
 *    nenhum import de valor alcança `zod` (os schemas ficam em módulos com `import "server-only"`
 *    e as telas usam as constantes puras de `*-constants.ts`).
 * 2. Do build (roda quando `.next` existe; no CI, o job `verify` repete este arquivo depois de
 *    `pnpm build` com `REQUIRE_BUILD=1`): nenhum chunk de `.next/static` contém o código do zod.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const CHUNKS = join(ROOT, ".next/static/chunks");

function listSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listSources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function resolveModule(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

interface Node {
  client: boolean;
  server: boolean;
  /** Pacotes importados (valor) e arquivos do projeto (`@@caminho`). */
  imports: string[];
}

const IMPORT_RE =
  /(?:import|export)\s+(type\s+)?([^;'"]*?)from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Nomes de valor de `{ a, type B, c as d }` (o nome original, antes do `as`). */
function valueNames(clause: string): string[] | null {
  const list = clause.match(/\{([^}]*)\}/)?.[1];
  if (list === undefined) return null;
  return list
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n && !n.startsWith("type "))
    .map((n) => n.split(/\s+as\s+/)[0]!.trim());
}

/** Reexportações nomeadas de um arquivo (`export { A } from "./x"`): nome → arquivo. */
function reexports(file: string, text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    const target = resolveModule(file, m[2] ?? "");
    if (!target) continue;
    for (const name of valueNames(`{${m[1]}}`) ?? []) out.set(name, target);
  }
  return out;
}

function buildGraph(): Map<string, Node> {
  const texts = new Map(listSources(SRC).map((f) => [f, readFileSync(f, "utf8")] as const));
  const barrels = new Map([...texts].map(([f, t]) => [f, reexports(f, t)] as const));
  const graph = new Map<string, Node>();
  for (const [f, text] of texts) {
    const imports: string[] = [];
    for (const m of text.matchAll(IMPORT_RE)) {
      if (m[1]) continue; // só tipos: apagado na compilação
      const clause = m[2] ?? "";
      const spec = m[3] ?? m[4] ?? "";
      const target = resolveModule(f, spec);
      if (!target) {
        imports.push(spec);
        continue;
      }
      const names = m[4] ? null : valueNames(clause);
      const rest = clause
        .replace(/\{[^}]*\}/, "")
        .replace(/,/g, "")
        .trim();
      // `import { type A } from` é só tipo; `import "x"` e `import X` levam o arquivo inteiro.
      if (names && names.length === 0 && !rest) continue;
      const map = barrels.get(target);
      if (names && !rest && map && map.size > 0 && /^\s*import/.test(m[0])) {
        // Pelo índice (barril): só os arquivos dos nomes usados.
        for (const n of names) imports.push(`@@${map.get(n) ?? target}`);
        continue;
      }
      imports.push(`@@${target}`);
    }
    const head = text.slice(0, 400);
    graph.set(f, {
      client: /^\s*["']use client["']/m.test(head),
      server: /^\s*["']use server["']/m.test(head),
      imports,
    });
  }
  return graph;
}

const rel = (p: string) => p.replace(`${ROOT}/`, "");

function zodPaths(): string[] {
  const graph = buildGraph();
  const out = new Set<string>();
  for (const [entry, n] of graph) {
    if (!n.client) continue;
    const seen = new Set<string>();
    const walk = (f: string, path: string[]) => {
      if (seen.has(f)) return;
      seen.add(f);
      const node = graph.get(f);
      // "use server" vira referência de ação no navegador: o corpo não entra no bundle.
      if (!node || node.server) return;
      for (const spec of node.imports) {
        if (spec.startsWith("@@")) walk(spec.slice(2), [...path, f]);
        else if (spec === "zod" || spec.startsWith("zod/"))
          out.add([...path, f].map(rel).join(" > ") + ` > ${spec}`);
      }
    };
    walk(entry, []);
  }
  return [...out].sort();
}

/** Marcas do código do zod 4 que sobrevivem à minificação (nomes de erro e de tipo). */
const ZOD_MARKERS = [/\$ZodError/, /ZodError/, /\$ZodType/];

describe("zod fora do cliente (item 85)", () => {
  it("nenhum componente cliente, do portal ou do Estúdio, importa zod (direto ou por cadeia)", () => {
    expect(zodPaths()).toEqual([]);
  });

  it("os módulos com schema zod são só de servidor", () => {
    for (const f of ["lib/ai/prompts.ts", "lib/sources/schema.ts", "lib/sources/activation.ts"]) {
      expect(readFileSync(join(SRC, f), "utf8"), f).toMatch(/^import "server-only";$/m);
    }
  });

  const built = existsSync(CHUNKS);
  const required = process.env.REQUIRE_BUILD === "1";
  const title = built
    ? "nenhum chunk do build (.next/static) carrega o zod"
    : "nenhum chunk do build carrega o zod (pulado: sem .next/static; rode `pnpm build` antes)";

  it.skipIf(!built && !required)(title, () => {
    expect(built, "REQUIRE_BUILD=1 exige o build: rode `pnpm build` antes").toBe(true);
    const offenders = readdirSync(CHUNKS)
      .filter((n) => n.endsWith(".js"))
      .filter((n) => {
        const text = readFileSync(join(CHUNKS, n), "utf8");
        return ZOD_MARKERS.some((re) => re.test(text));
      });
    expect(offenders).toEqual([]);
  });
});
