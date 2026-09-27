// @vitest-environment node
import { ESLint } from "eslint";

/*
 * Regra de aderência do brand kit (design-system/_adherence.oxlintrc.json → eslint.config.mjs):
 * sem hex nem px crus em src/components, só as duas famílias de fonte, import pelo índice.
 */
const eslint = new ESLint({ cwd: process.cwd() });

async function messages(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`);
}

const component = "src/components/ui/Fake.tsx";

it("bloqueia hex cru em componente", async () => {
  const out = await messages(
    `export const A = () => <div style={{ color: "#fff" }} />;\n`,
    component,
  );
  expect(out.join("\n")).toMatch(/no-restricted-syntax: .*hex/i);
});

it("bloqueia px cru em classe e em template", async () => {
  const cls = await messages(`export const A = () => <div className="h-[12px]" />;\n`, component);
  expect(cls.join("\n")).toMatch(/no-restricted-syntax: .*px/i);
  const tpl = await messages("export const w = (n: number) => `calc(${n} + 12px)`;\n", component);
  expect(tpl.join("\n")).toMatch(/no-restricted-syntax: .*px/i);
});

it("bloqueia família de fonte fora do sistema", async () => {
  const out = await messages(
    `export const A = () => <div style={{ fontFamily: "Arial" }} className="font-[Inter]" />;\n`,
    component,
  );
  expect(out.filter((m) => /fonte|font/i.test(m)).length).toBeGreaterThanOrEqual(2);
});

it("aceita classes de token", async () => {
  const out = await messages(
    `export const A = () => <div className="h-input rounded-lg bg-card text-strong" />;\n`,
    component,
  );
  expect(out).toEqual([]);
});

it("fora de src/components, importe pelo índice", async () => {
  const bad = await messages(
    `import { Button } from "@/components/ui/Button";\nexport const B = Button;\n`,
    "src/app/fake/page.tsx",
  );
  expect(bad.join("\n")).toMatch(/no-restricted-imports/);
  const good = await messages(
    `import { Button } from "@/components";\nexport const B = Button;\n`,
    "src/app/fake/page.tsx",
  );
  expect(good).toEqual([]);
});
