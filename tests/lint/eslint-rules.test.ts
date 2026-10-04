// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Item 40 da spec de melhorias (D-16): a regra de aderência cobre `src/app/**`, bloqueia
// `<select>`/`<textarea>` crus fora de `src/components/ui/**` e névoa em estado interativo.
const eslint = new ESLint({ cwd: process.cwd() });

async function messages(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? [])
    .filter((m) => m.ruleId === "no-restricted-syntax")
    .map((m) => m.message);
}

const RAW_SELECT = `export function Tela() {
  return (
    <select name="ordem" aria-label="Ordem">
      <option value="a">A</option>
    </select>
  );
}
`;

const RAW_TEXTAREA = `export function Tela() {
  return <textarea name="motivo" aria-label="Motivo" />;
}
`;

const HOVER_NEVOA = `export function Tela() {
  return <a href="/" className="rounded-lg hover:bg-nevoa">Início</a>;
}
`;

const ARIA_NEVOA_2 = `export function Tela() {
  return <button type="button" className="aria-pressed:bg-nevoa-2">Fixar</button>;
}
`;

const HOVER_TOKEN = `export function Tela() {
  return <a href="/" className="rounded-lg bg-section hover:bg-hover">Início</a>;
}
`;

describe("regras de aderência ao kit (item 40)", () => {
  it("acusa <select> cru numa tela de src/app", async () => {
    const out = await messages(RAW_SELECT, "src/app/estudio/fixture-lint/page.tsx");
    expect(out.some((m) => m.includes("Controle cru"))).toBe(true);
  }, 30_000);

  it("acusa <textarea> cru fora de src/components/ui", async () => {
    const out = await messages(RAW_TEXTAREA, "src/components/studio/FixtureLint.tsx");
    expect(out.some((m) => m.includes("Controle cru"))).toBe(true);
  }, 30_000);

  it("acusa hover:bg-nevoa e aria-pressed:bg-nevoa-2", async () => {
    const hover = await messages(HOVER_NEVOA, "src/app/(public)/fixture-lint/page.tsx");
    const pressed = await messages(ARIA_NEVOA_2, "src/components/editorial/FixtureLint.tsx");
    expect(hover.some((m) => m.includes("bg-hover"))).toBe(true);
    expect(pressed.some((m) => m.includes("bg-hover"))).toBe(true);
  }, 30_000);

  it("aceita bg-hover no estado interativo", async () => {
    expect(await messages(HOVER_TOKEN, "src/app/(public)/fixture-lint/page.tsx")).toEqual([]);
  }, 30_000);

  it("não acusa <select>/<textarea> dentro das primitivas de src/components/ui", async () => {
    expect(await messages(RAW_SELECT, "src/components/ui/FixtureLint.tsx")).toEqual([]);
    expect(await messages(RAW_TEXTAREA, "src/components/ui/FixtureLint.tsx")).toEqual([]);
  }, 30_000);
});
