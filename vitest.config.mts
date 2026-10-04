import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` lança fora do bundler do Next; nos testes vale o módulo vazio.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}", "tests/ci/**/*.test.ts", "tests/lint/**/*.test.ts"],
        },
      },
      {
        // Scripts de build (SW, ícones): Node puro, sem banco.
        extends: true,
        test: { name: "scripts", environment: "node", include: ["scripts/**/*.test.ts"] },
      },
      {
        // Integração compartilha um banco: arquivos em série para contagens do seed não
        // enxergarem linhas temporárias de outras suítes.
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false,
        },
      },
      {
        // Segurança (P6-T3): headers, CSP, cron sem segredo, RLS com anon, extração e injeção.
        // As de RLS usam o banco local; arquivos em série pelo mesmo motivo da integração.
        extends: true,
        test: {
          name: "security",
          environment: "node",
          include: ["tests/security/**/*.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
