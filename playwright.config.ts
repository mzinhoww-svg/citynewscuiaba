import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
// Worktrees em paralelo usam .local/offset para deslocar portas (scripts/local-stack/env.sh).
const offset = existsSync(".local/offset")
  ? Number(readFileSync(".local/offset", "utf8").trim())
  : 0;
const port = 3000 + offset;
/**
 * Servidor de fixtures (painel de fontes, FS-T8): `next dev` com `CRAWLER_FIXTURES=1`, que só
 * vale fora de produção (`fixturesEnabled` em src/lib/sources/http-deps.ts ignora a variável com
 * NODE_ENV=production). Serve os sites fictícios `*.example` de tests/fixtures sem rede: é o único
 * jeito de a análise por link e o teste de conexão rodarem no e2e.
 */
const fixturesPort = port + 1;
const FIXTURE_SPECS = "**/control-sources-detail.spec.ts";

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
      testIgnore: FIXTURE_SPECS,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      testIgnore: FIXTURE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      // Contra o servidor de fixtures (porta +1); os testes mudam o viewport quando precisam.
      name: "fixtures",
      testMatch: FIXTURE_SPECS,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: `http://localhost:${fixturesPort}`,
      },
    },
    ...(isCI
      ? [
          {
            name: "mobile-webkit",
            testIgnore: FIXTURE_SPECS,
            use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
          },
        ]
      : []),
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
      command: `pnpm exec next dev -p ${fixturesPort}`,
      env: {
        CRAWLER_FIXTURES: "1",
        AI_PROVIDER: "fake",
        APP_URL: `http://localhost:${fixturesPort}`,
      },
      port: fixturesPort,
      reuseExistingServer: !isCI,
      timeout: 240_000,
    },
  ],
});
