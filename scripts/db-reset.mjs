#!/usr/bin/env node
// pnpm db:reset — recria o banco local com migrations + seed.
// Usa o Supabase CLI quando existe (CI, máquinas com Docker); senão, a pilha local sem Docker (A-017).
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const has = (bin) => spawnSync("sh", ["-c", `command -v ${bin}`]).status === 0;
const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", cwd: root, env: { ...process.env, ...env } });

if (has("supabase") && !process.env.CN_LOCAL_STACK) {
  run("supabase db reset");
  process.exit(0);
}

run("bash scripts/local-stack/start.sh");
const offsetFile = join(root, ".local/offset");
const offset = Number(process.env.CN_STACK_OFFSET ?? (existsSync(offsetFile) ? readFileSync(offsetFile, "utf8").trim() : 0));
const dbUrl = `postgresql://postgres:postgres@127.0.0.1:${54322 + offset}/postgres`;
const psql = (args) => run(`psql "${dbUrl}" -q -v ON_ERROR_STOP=1 ${args}`, { PGPASSWORD: "postgres", PGOPTIONS: "-c client_min_messages=warning" });

psql(`-c "select cron.unschedule(jobid) from cron.job;" -o /dev/null`);
psql(`-c "drop schema if exists public cascade; create schema public; truncate auth.users cascade;"`);
psql(`-f scripts/local-stack/bootstrap.sql`);
psql(`-f scripts/local-stack/post-auth.sql`);

const migrations = readdirSync(join(root, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const file of migrations) {
  console.log(`migration ${file}`);
  psql(`-f supabase/migrations/${file}`);
}
console.log("seed supabase/seed.sql");
psql(`-f supabase/seed.sql`);
psql(`-c "notify pgrst, 'reload schema';"`);
console.log("banco local recriado");
