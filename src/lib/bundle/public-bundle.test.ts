// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Guarda do bundle público (P6-T1, B-018). O JS inicial das páginas públicas tem orçamento de
 * 170 kB gz (lighthouserc.json); o que quebrou o orçamento foi código de servidor chegando ao
 * navegador por uma cadeia de imports (zod via ranking, o editor do Estúdio via índice de
 * componentes). Este teste segue os imports estáticos a partir de todo arquivo "use client" fora
 * do Estúdio e falha se algum alcançar um pacote pesado ou só de servidor.
 */

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Pacotes que não podem entrar no bundle público. */
const FORBIDDEN = [
  "zod",
  "ai",
  "@ai-sdk",
  "@supabase",
  "@tiptap",
  "prosemirror",
  "linkedom",
  "web-push",
  "fast-xml-parser",
  "@mozilla/readability",
  "sharp",
  "lucide-react",
];

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
  /** Especificadores de import (pacotes) e caminhos resolvidos (arquivos do projeto). */
  imports: string[];
}

const files = listSources(SRC);
const barrelFile = join(SRC, "components/index.ts");

/** Nome exportado pelo índice de componentes → arquivo que o define. */
const barrel = new Map<string, string>();
for (const m of readFileSync(barrelFile, "utf8").matchAll(
  /export\s*\{([^}]*)\}\s*from\s*"([^"]+)";/g,
)) {
  const target = resolveModule(barrelFile, m[2] ?? "");
  if (!target) continue;
  for (const raw of (m[1] ?? "").split(",")) {
    const name = raw.trim().replace(/^type\s+/, "");
    if (name && !raw.trim().startsWith("type ")) barrel.set(name, target);
  }
}

const graph = new Map<string, Node>();
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const head = text.slice(0, 400);
  const imports: string[] = [];
  const re =
    /(?:import|export)\s+(type\s+)?([^;'"]*?)from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const m of text.matchAll(re)) {
    if (m[1]) continue; // só tipos: apagado na compilação
    const spec = m[3] ?? m[4] ?? "";
    if (spec === "@/components" && m[2]) {
      const list = m[2].match(/\{([^}]*)\}/)?.[1] ?? "";
      for (const raw of list.split(",")) {
        const item = raw.trim();
        if (!item || item.startsWith("type ")) continue;
        const target = barrel.get(item.split(/\s+as\s+/)[0] ?? "");
        if (target) imports.push(`@@${target}`);
      }
      continue;
    }
    const target = resolveModule(f, spec);
    imports.push(target ? `@@${target}` : spec);
  }
  graph.set(f, {
    client: /^\s*["']use client["']/m.test(head),
    server: /^\s*["']use server["']/m.test(head),
    imports,
  });
}

function isForbidden(spec: string): string | null {
  return FORBIDDEN.find((p) => spec === p || spec.startsWith(`${p}/`)) ?? null;
}

const rel = (p: string) => p.replace(`${ROOT}/`, "");

function violations(): string[] {
  const out = new Set<string>();
  const entries = [...graph]
    .filter(([f, n]) => n.client && !f.includes("/estudio/") && !f.includes("/components/studio/"))
    .map(([f]) => f);
  for (const entry of entries) {
    const seen = new Set<string>();
    const walk = (f: string, path: string[]) => {
      if (seen.has(f)) return;
      seen.add(f);
      const node = graph.get(f);
      // "use server" vira referência de ação no navegador: o corpo não entra no bundle.
      if (!node || node.server) return;
      for (const spec of node.imports) {
        if (spec.startsWith("@@")) {
          const next = spec.slice(2);
          if (!next.includes("/components/studio/") && next !== join(SRC, "components/estudio.ts"))
            walk(next, [...path, f]);
          continue;
        }
        const bad = isForbidden(spec);
        if (bad) out.add([...path, f].map(rel).join(" > ") + ` > ${spec}`);
      }
    };
    walk(entry, []);
  }
  return [...out].sort();
}

describe("bundle público (B-018)", () => {
  it("nenhum componente cliente das páginas públicas alcança pacote pesado ou de servidor", () => {
    expect(violations()).toEqual([]);
  });

  it("o índice de componentes públicos não reexporta o Estúdio", () => {
    const text = readFileSync(barrelFile, "utf8");
    expect(text).not.toMatch(/from\s*"\.\/studio\//);
  });

  it("a validação com zod do ranking fica fora de score.ts (usado no navegador)", () => {
    expect(readFileSync(join(SRC, "lib/ranking/score.ts"), "utf8")).not.toMatch(/from "zod"/);
  });
});
