#!/usr/bin/env node
// pnpm db:seed:guide — leva local de listas do Guia com dados fictícios (scripts/seed-guide-fixtures.ts).
// Empacota o TypeScript com esbuild (aliases do tsconfig, `server-only` vazio) e executa.
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
// Dentro do projeto (`.local/`, fora do git): as dependências `external` resolvem a partir daqui.
const dir = join(root, ".local");
mkdirSync(dir, { recursive: true });
const out = join(dir, "seed-guide.bundle.cjs");
try {
  await build({
    entryPoints: [join(root, "scripts/seed-guide-fixtures.ts")],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "cjs",
    packages: "external",
    tsconfig: join(root, "tsconfig.json"),
    alias: {
      "server-only": join(root, "node_modules/server-only/empty.js"),
      "next/headers": join(root, "node_modules/next/headers.js"),
    },
    logLevel: "warning",
  });
  const r = spawnSync(process.execPath, [out], { stdio: "inherit", cwd: root, env: process.env });
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(out, { force: true });
}
