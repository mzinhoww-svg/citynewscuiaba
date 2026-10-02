import { defineConfig, devices } from "@playwright/test";

/**
 * Config dedicada ao roteiro de fumaça de produção: sem webServer, sem globalSetup, sem fixtures.
 * Só navega (GET) em BASE_URL. Uso:
 *   CN_ROTEIRO=1 BASE_URL=https://citynewscuiaba.vercel.app \
 *     pnpm exec playwright test -c tests/roteiro/playwright.producao.config.ts
 */
export default defineConfig({
  testDir: ".",
  testMatch: "producao.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "../../test-results/producao",
  use: {
    baseURL: process.env.BASE_URL ?? "https://citynewscuiaba.vercel.app",
    locale: "pt-BR",
    timezoneId: "America/Cuiaba",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: "producao" }],
});
