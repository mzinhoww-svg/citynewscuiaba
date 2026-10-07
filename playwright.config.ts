import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";
import webpush from "web-push";
import {
  SERIAL_MOBILE_PROJECT,
  SERIAL_PROJECT,
  SERIAL_SPECS,
  SERIAL_WEBKIT_PROJECT,
} from "./tests/e2e/projects";

const isCI = Boolean(process.env.CI);
// Chromium: deixa `context.route`/`setOffline` alcançarem o `fetch` do service worker (leitura
// offline, spec 2026-09-28 §8; tests/e2e/offline.spec.ts). Precisa existir antes do navegador subir.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS ??= "1";
// Worktrees em paralelo usam .local/offset para deslocar portas (scripts/local-stack/env.sh).
const offset = existsSync(".local/offset")
  ? Number(readFileSync(".local/offset", "utf8").trim())
  : 0;
const port = 3000 + offset;
/**
 * Push no e2e (spec 2026-09-28 §16; G15/G16): par VAPID gerado ao carregar (a pública é embutida
 * no build), provedor real `webpush` e servidor de push falso em 127.0.0.1:<porta + 2>
 * (tests/e2e/global-setup.ts), aceito só por PUSH_ENDPOINT_TEST_HOSTS com CN_E2E=1.
 */
const vapid = webpush.generateVAPIDKeys();
const fakePushPort = port + 2;
process.env.CN_FAKE_PUSH_PORT = String(fakePushPort);
const PUSH_ENV = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: "mailto:teste@citynews.local",
  PUSH_PROVIDER: "webpush",
  PUSH_ENDPOINT_TEST_HOSTS: `127.0.0.1:${fakePushPort}`,
  CN_E2E: "1",
};
/**
 * Servidor de fixtures (painel de fontes, FS-T8): `next dev` com `CRAWLER_FIXTURES=1`, que só
 * vale fora de produção (`fixturesEnabled` em src/lib/sources/http-deps.ts ignora a variável com
 * NODE_ENV=production). Serve os sites fictícios `*.example` de tests/fixtures sem rede: é o único
 * jeito de a análise por link e o teste de conexão rodarem no e2e.
 */
const fixturesPort = port + 1;
/**
 * Specs que precisam do servidor de fixtures: cadastro/detalhe (FS-T8), jornadas (FS-T9) e o
 * roteiro exploratório do painel (`tests/roteiro/fontes.spec.ts`, só com CN_ROTEIRO=1).
 */
const FIXTURE_SPECS = [
  "**/control-sources-detail.spec.ts",
  "**/control-sources-flow.spec.ts",
  "**/roteiro/fontes.spec.ts",
  // Guia: proposta por link com a página fictícia do portal Sabores MT (GUIA-T5).
  "**/admin-guide-link.spec.ts",
];
/**
 * Os três projetos usam o mesmo banco local e o spec de fixtures altera fontes do seed. Para
 * `desktop`/`mobile` (e `mobile-webkit` no CI) nunca lerem uma lista no meio de uma mutação,
 * `fixtures` depende deles: roda sozinho, depois que os outros terminam (localmente, para rodar
 * só o spec de fixtures sem as suítes dos outros projetos: `--no-deps`).
 */
const BROWSER_PROJECTS = ["desktop", "mobile", ...(isCI ? ["mobile-webkit"] : [])];
/**
 * Specs que mudam estado global (flags, regras, destaques, configurações; tests/e2e/projects.ts)
 * ficam fora dos projetos paralelos e rodam em `serial-flags*`: um worker, sem paralelismo, depois
 * dos paralelos (localmente; no CI cada um tem job e banco próprios, com `--no-deps`).
 */
const PARALLEL_IGNORE = [...FIXTURE_SPECS, ...SERIAL_SPECS];
const DESKTOP = { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } };
const MOBILE = {
  ...devices["Desktop Chrome"],
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
};
const WEBKIT = { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } };
const serial = { testMatch: SERIAL_SPECS, fullyParallel: false, workers: 1 };

export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
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
    { name: "desktop", testIgnore: PARALLEL_IGNORE, use: DESKTOP },
    { name: "mobile", testIgnore: PARALLEL_IGNORE, use: MOBILE },
    {
      // Contra o servidor de fixtures (porta +1); os testes mudam o viewport quando precisam.
      name: "fixtures",
      testMatch: FIXTURE_SPECS,
      dependencies: BROWSER_PROJECTS,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        baseURL: `http://localhost:${fixturesPort}`,
      },
    },
    ...(isCI ? [{ name: "mobile-webkit", testIgnore: PARALLEL_IGNORE, use: WEBKIT }] : []),
    // Estado global em série: só o desktop muda dado; os outros conferem leitura, tela e axe.
    { name: SERIAL_PROJECT, ...serial, dependencies: BROWSER_PROJECTS, use: DESKTOP },
    { name: SERIAL_MOBILE_PROJECT, ...serial, dependencies: [SERIAL_PROJECT], use: MOBILE },
    ...(isCI
      ? [
          {
            name: SERIAL_WEBKIT_PROJECT,
            ...serial,
            dependencies: [SERIAL_MOBILE_PROJECT],
            use: WEBKIT,
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: `pnpm build && pnpm exec next start -p ${port}`,
      // Libera a vitrine /design-system no build de produção para o teste de a11y (P0-T9b).
      env: { CN_SHOW_DS: "1", ...PUSH_ENV },
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
        ...PUSH_ENV,
      },
      port: fixturesPort,
      reuseExistingServer: !isCI,
      timeout: 240_000,
    },
  ],
});
