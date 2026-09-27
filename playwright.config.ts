import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
// Worktrees em paralelo usam .local/offset para deslocar portas (scripts/local-stack/env.sh).
const offset = existsSync(".local/offset")
  ? Number(readFileSync(".local/offset", "utf8").trim())
  : 0;
const port = 3000 + offset;

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
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
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
            use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
          },
        ]
      : []),
  ],
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${port}`,
    // Libera a vitrine /design-system no build de produção para o teste de a11y (P0-T9b).
    env: { CN_SHOW_DS: "1" },
    port,
    reuseExistingServer: !isCI,
    timeout: 240_000,
  },
});
