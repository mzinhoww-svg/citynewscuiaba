import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
// Worktrees em paralelo usam .local/offset para deslocar portas (scripts/local-stack/env.sh).
const offset = existsSync(".local/offset")
  ? Number(readFileSync(".local/offset", "utf8").trim())
  : 0;
const port = 3000 + offset;
// Servidor de desenvolvimento só para as specs que precisam de fixtures (hosts fictícios `*.example`).
// `next start` é sempre NODE_ENV=production e `fixturesEnabled` fica falso por segurança (A-128,
// A-156): a guarda não é afrouxada, essas specs rodam num `next dev` próprio (A-160).
const fixturesPort = port + 500;
const FIXTURE_SPECS = ["**/control-sources-detail.spec.ts", "**/control-sources-flow.spec.ts"];
// Contingência (P5-T10) liga e desliga flags globais (modo leitura, IA, publicação automática): roda
// sozinha, depois de tudo, no desktop; as specs com fixtures só começam quando ela termina.
const GLOBAL_FLAG_SPECS = ["**/admin-contingency.spec.ts"];
// Estas specs mexem na via rápida e nas cotas globais (`fast_lane_max`, "Via rápida: N de M" da
// lista): rodam depois dos demais projetos para não disputar esses números com a spec da lista.
const AFTER_MAIN = ["desktop", "mobile", ...(isCI ? ["mobile-webkit"] : [])];

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "pt-BR",
    timezoneId: "America/Cuiaba",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: [...FIXTURE_SPECS, ...GLOBAL_FLAG_SPECS],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testIgnore: [...FIXTURE_SPECS, ...GLOBAL_FLAG_SPECS],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    ...(isCI
      ? [
          {
            name: "mobile-webkit",
            testIgnore: [...FIXTURE_SPECS, ...GLOBAL_FLAG_SPECS],
            use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
          },
        ]
      : []),
    {
      name: "global-flags",
      testMatch: GLOBAL_FLAG_SPECS,
      dependencies: AFTER_MAIN,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    // Specs com fixtures: `next dev` em outra porta, CRAWLER_FIXTURES=1 e AI_PROVIDER=fake.
    {
      name: "fixtures-desktop",
      testMatch: FIXTURE_SPECS,
      dependencies: [...AFTER_MAIN, "global-flags"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${fixturesPort}`,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "fixtures-mobile",
      testMatch: FIXTURE_SPECS,
      dependencies: [...AFTER_MAIN, "global-flags"],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${fixturesPort}`,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: `pnpm build && pnpm exec next start -p ${port}`,
      // Libera a vitrine /design-system no build de produção para o teste de a11y (P0-T9b).
      env: { CN_SHOW_DS: "1" },
      port,
      reuseExistingServer: !isCI,
      timeout: 240_000,
    },
    {
      // O desenvolvimento usa `.next/dev`, separado da saída do build (Next 16): os dois coexistem.
      command: `pnpm exec next dev -p ${fixturesPort}`,
      env: { CRAWLER_FIXTURES: "1", AI_PROVIDER: "fake" },
      // `/entrar` compilada de antemão: o primeiro login dos testes não paga a compilação a frio.
      url: `http://localhost:${fixturesPort}/entrar`,
      reuseExistingServer: !isCI,
      timeout: 240_000,
    },
  ],
});
