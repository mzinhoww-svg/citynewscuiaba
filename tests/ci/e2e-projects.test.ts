// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../playwright.config";
import {
  SERIAL_MOBILE_PROJECT,
  SERIAL_PROJECT,
  SERIAL_SPECS,
  SERIAL_WEBKIT_PROJECT,
} from "../e2e/projects";

// Item 91 (T-18): specs que mudam estado global rodam em série, fora dos projetos paralelos,
// e o CI roda esses projetos (nenhum spec deixa de rodar).
const root = process.cwd();
const projects = config.projects ?? [];
const byName = (name: string) => projects.find((p) => p.name === name);
const asList = (v: unknown): string[] =>
  v === undefined ? [] : Array.isArray(v) ? (v as string[]) : [v as string];
const workflow = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

/** Caminho do spec a partir do padrão `**\/pasta/nome.spec.ts`. */
const specPath = (glob: string) => join(root, "tests", glob.replace(/^\*\*\//, ""));

/** Specs que escrevem em tabelas de estado global ou mexem nas posições de destaque. */
function globalWriters(): string[] {
  const out: string[] = [];
  for (const dir of ["e2e", "a11y"]) {
    for (const name of readdirSync(join(root, "tests", dir))) {
      if (!name.endsWith(".spec.ts")) continue;
      const text = readFileSync(join(root, "tests", dir, name), "utf8");
      const writes =
        /from\("(feature_flags|app_settings|rules|rec_weights|ai_reviewer_settings|featured_items)"\)\s*\.(update|upsert|insert|delete)/.test(
          text.replace(/\s+/g, " ").replace(/\)\s+\./g, ")."),
        ) || /\b(pinViaDb|endAllPins)\(/.test(text);
      if (writes) out.push(`**/${dir}/${name}`);
    }
  }
  return out;
}

describe("projetos do Playwright", () => {
  it("os specs seriais existem", () => {
    for (const glob of SERIAL_SPECS) expect(existsSync(specPath(glob)), glob).toBe(true);
  });

  it("todo spec que escreve estado global está na lista serial", () => {
    expect(SERIAL_SPECS).toEqual(expect.arrayContaining(globalWriters()));
  });

  it("serial-flags: desktop, um worker, sem paralelismo, depois dos projetos paralelos", () => {
    const serial = byName(SERIAL_PROJECT);
    expect(serial).toBeDefined();
    expect(serial!.workers).toBe(1);
    expect(serial!.fullyParallel).toBe(false);
    expect(asList(serial!.testMatch)).toEqual(SERIAL_SPECS);
    expect(serial!.dependencies).toEqual(expect.arrayContaining(["desktop", "mobile"]));
    expect(serial!.use?.viewport).toEqual({ width: 1280, height: 800 });
  });

  it("serial-flags-mobile roda depois do serial do desktop, também em série", () => {
    const mobile = byName(SERIAL_MOBILE_PROJECT);
    expect(mobile).toBeDefined();
    expect(mobile!.workers).toBe(1);
    expect(mobile!.fullyParallel).toBe(false);
    expect(asList(mobile!.testMatch)).toEqual(SERIAL_SPECS);
    expect(mobile!.dependencies).toEqual([SERIAL_PROJECT]);
    expect(mobile!.use?.isMobile).toBe(true);
  });

  it("os projetos paralelos ignoram os specs seriais", () => {
    for (const name of ["desktop", "mobile"]) {
      const p = byName(name);
      expect(p, name).toBeDefined();
      expect(asList(p!.testIgnore), name).toEqual(expect.arrayContaining(SERIAL_SPECS));
    }
  });
});

describe("matriz de e2e do CI", () => {
  it("roda os três projetos seriais (desktop num job; celular e WebKit em outro, um worker)", () => {
    expect(workflow).toMatch(new RegExp(`--project=${SERIAL_PROJECT} --no-deps`));
    expect(workflow).toMatch(
      new RegExp(
        `--project=${SERIAL_MOBILE_PROJECT} --project=${SERIAL_WEBKIT_PROJECT} --no-deps --workers=1`,
      ),
    );
  });

  it("os projetos paralelos e o de fixtures continuam na matriz", () => {
    for (const p of ["desktop", "mobile", "mobile-webkit", "fixtures"])
      expect(workflow, p).toMatch(new RegExp(`--project=${p}[ "]`));
  });

  it("o WebKit serial existe no CI", () => {
    expect(readFileSync(join(root, "playwright.config.ts"), "utf8")).toContain(
      "SERIAL_WEBKIT_PROJECT",
    );
  });
});
