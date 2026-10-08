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

/*
 * Aderência ao kit (UX-W2-T15, item 40 / D-16): fora de `src/components/ui/**`, lista e texto
 * longo usam as primitivas (`Select`/`SelectControl`, `TextArea`), nunca `<select>`/`<textarea>`
 * crus; e o estado interativo (hover, pressionado, página atual) usa `bg-hover`, nunca
 * `bg-nevoa`/`bg-nevoa-2` (névoa é fundo estático: `bg-section`).
 */
const RAW_CONTROL_MSG =
  "Controle cru: use `Select`/`SelectControl` ou `TextArea` de `@/components` (src/components/ui).";
const HOVER_NEVOA = String.raw`/(hover|aria-pressed|aria-\[current=page\]):bg-nevoa(-2)?(?![\w-])/`;
const HOVER_NEVOA_MSG =
  "Estado interativo com névoa: use `bg-hover` (token --surface-hover), não `bg-nevoa`/`bg-nevoa-2`.";

const interactiveSurface = [
  { selector: `Literal[value=${HOVER_NEVOA}]`, message: HOVER_NEVOA_MSG },
  { selector: `TemplateElement[value.raw=${HOVER_NEVOA}]`, message: HOVER_NEVOA_MSG },
];
const rawControls = [
  { selector: "JSXOpeningElement[name.name=/^(select|textarea)$/]", message: RAW_CONTROL_MSG },
];

/*
 * Exceções documentadas a `rawControls` (a troca pela primitiva mudaria comportamento ou DOM
 * testado; cada uma tem o motivo). Ao migrar um arquivo, tire-o daqui.
 */
const RAW_CONTROL_EXCEPTIONS = [
  // A-149: select em pílula dentro da barra de filtros do portal (forma própria, não campo).
  "src/components/editorial/FilterBar.tsx",
  // Compositor do Pergunte: textarea que cresce com o texto e envia com Enter, sem rótulo visível.
  "src/components/ai/ChatComposer.tsx",
  // Texto alternativo: contador e dica sempre ligados ao campo e modo "decorativa" que esvazia e
  // desliga o campo; o `TextArea` do kit ainda não cobre esse par.
  "src/components/studio/ImageTextForm.tsx",
  // Selects embutidos no rótulo de cada opção de rádio (rótulo vem do `aria-label`, sem FieldShell).
  "src/components/studio/sources/BulkFrequencyDialog.tsx",
  // Motivo/nota com erro em `role="alert"` que substitui a dica (a moldura do kit mostra as duas e
  // não anuncia); migrar quando `FieldShell` ganhar esse modo.
  "src/components/studio/JobTable.tsx",
  "src/components/studio/QueueTable.tsx",
  "src/components/studio/DecisionPanel.tsx",
  "src/components/studio/ImageApproval.tsx",
  "src/components/studio/SubmissionReview.tsx",
  "src/components/studio/CorrectionForm.tsx",
  "src/components/studio/ReportResponder.tsx",
  "src/components/studio/PublishDialog.tsx",
  // Linha fina e descrição SEO com nota de origem e contador colorido próprios abaixo do campo.
  "src/components/studio/ArticleEditor.tsx",
  // Texto do push: quebra de linha removida na digitação, contador no `aside` e texto longo do
  // modo avançado; ambos já dentro de `FieldShell`.
  "src/components/studio/push/NewPushForm.tsx",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["src/components/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...adherence, ...interactiveSurface, ...rawControls],
    },
  },
  {
    // As primitivas são o único lugar com `<select>`/`<textarea>` crus; as exceções acima também.
    files: ["src/components/ui/**/*.{ts,tsx}", ...RAW_CONTROL_EXCEPTIONS],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "no-restricted-syntax": ["error", ...adherence, ...interactiveSurface] },
  },
  {
    // Item 40: a mesma aderência cobre as telas em `src/app/**`.
    files: ["src/app/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", ...adherence, ...interactiveSurface, ...rawControls],
    },
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
    // Skills de terceiros (superpowers) instaladas em .claude/skills.
    ".claude/**",
    "scripts/**",
    ".local/**",
    "public/sw.js",
    "public/offline.js",
    "tests/fixtures/sw/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    "docs/security-audit/.venv/**",
    ".impeccable/**",
  ]),
]);

export default eslintConfig;
