import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

/*
 * Regra de aderência do brand kit (design-system/_adherence.oxlintrc.json, DESIGN.md R13):
 * componentes usam tokens (classes do Tailwind mapeadas em src/styles/globals.css), nunca
 * hex ou px crus, e só as famílias Schibsted Grotesk e Source Serif 4.
 */
const HEX = String.raw`/#[0-9a-fA-F]{3,8}\b/`;
const PX = String.raw`/\b\d+(\.\d+)?px\b/`;
const HEX_MSG = "Hex cru: use um token de cor (classe do Tailwind mapeada em globals.css).";
const PX_MSG = "px cru: use um token de espaço, tamanho ou raio (classe mapeada em globals.css).";
const FONT_MSG =
  "Fonte fora do sistema: use font-sans (Schibsted Grotesk) ou font-serif (Source Serif 4).";

const adherence = [
  { selector: `Literal[value=${HEX}]`, message: HEX_MSG },
  { selector: `TemplateElement[value.raw=${HEX}]`, message: HEX_MSG },
  { selector: `Literal[value=${PX}]`, message: PX_MSG },
  { selector: `TemplateElement[value.raw=${PX}]`, message: PX_MSG },
  {
    selector: String.raw`Literal[value=/font-family\s*:(?!\s*var\(--font-(sans|serif)\))/i]`,
    message: FONT_MSG,
  },
  { selector: String.raw`Literal[value=/(^|\s|:)font-\[/]`, message: FONT_MSG },
  { selector: String.raw`TemplateElement[value.raw=/(^|\s|:)font-\[/]`, message: FONT_MSG },
  { selector: "Property[key.name='fontFamily']", message: FONT_MSG },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...adherence] },
  },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["src/components/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: String.raw`(^@/components/|/components/)(ui|editorial|studio|ai|cx)(/|$)`,
              message: 'Importe componentes pelo índice: `import { … } from "@/components"`.',
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "design-system/**",
    "scripts/**",
    ".local/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
