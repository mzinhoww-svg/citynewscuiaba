#!/usr/bin/env node
// Ativação das fontes pausadas (decisão R43). Idempotente.
//
//   node scripts/ops/activate-sources.mjs                 # dry-run (padrão): testa a extração ao vivo e mostra o plano
//   node scripts/ops/activate-sources.mjs --apply         # grava no banco (explícito)
//   opções: --only slug,slug   --config caminho.json   --report caminho.json
//
// O que faz por fonte do arquivo de configuração (scripts/ops/sources-activation.json, sem segredos):
//   1. Lê o robots.txt e baixa a página/feed/sitemap ao vivo com o CityNewsBot, usando os mesmos
//      módulos do pipeline (crawlGet, checkRobots, extractEntries, extractPageList).
//   2. Passa se há >= 3 itens com título, link e data plausível (veredito em src/lib/sources/activation.ts).
//   3. --apply: passou -> `source_admin_update` (kind, feed_url, consumption, terms_*, frequência,
//      limite) e depois `source_admin_status('resume')`; não passou -> continua `paused`, grava o
//      motivo exato em `last_error` e `status_reason` (robots | quality | other).
// As mesmas RPCs do Painel de Fontes (0011/0031/0032): versão otimista, trigger de campos críticos
// e trilha de auditoria (`audit_log`, com reason e batchId). Nunca há DELETE.
//
// --apply precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente. Sem eles o
// dry-run roda só a parte de rede. Rede atrás de proxy: NODE_USE_ENV_PROXY=1 e NODE_EXTRA_CA_CERTS.
import { build } from "esbuild";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function parseArgs(argv) {
  const a = { apply: false, dryRun: false, only: null, config: join(root, "scripts/ops/sources-activation.json"), report: null, emitSql: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--apply") a.apply = true;
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--only") a.only = (argv[++i] ?? "").split(",").filter(Boolean);
    else if (k === "--config") a.config = resolve(argv[++i] ?? "");
    else if (k === "--report") a.report = resolve(argv[++i] ?? "");
    else if (k === "--emit-sql") a.emitSql = resolve(argv[++i] ?? "");
    else throw new Error(`opção desconhecida: ${k}`);
  }
  if (a.apply && a.dryRun) throw new Error("--apply e --dry-run juntos: escolha um");
  return a;
}

/** Empacota os módulos do pipeline (TypeScript, alias @/) num arquivo temporário e importa. */
async function loadLib() {
  // Dentro de node_modules para os pacotes (zod, linkedom) resolverem a partir do bundle.
  const dir = await mkdtemp(join(root, "node_modules", ".citynews-activate-"));
  const outfile = join(dir, "lib.mjs");
  await build({
    stdin: {
      contents: `
        export * from "@/lib/sources/activation";
        export { crawlDelayFromRobots, isForbiddenTarget } from "@/lib/sources/discover";
        export { extractPageList } from "@/lib/sources/page-list";
        export { crawlDeps } from "@/lib/sources/http-deps";
        export { checkRobots, crawlGet } from "@/lib/pipeline/http";
        export { detectFormat, extractEntries } from "@/lib/pipeline/steps/extract";
        export { resolveYearlySitemapUrl, SITEMAP_PREFIX_BYTES } from "@/lib/pipeline/sitemap";
      `,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    packages: "external",
    // `server-only` (schemas com zod, item 85) lança fora do bundler do Next: aqui vale o vazio.
    alias: { "@": join(root, "src"), "server-only": join(root, "node_modules/server-only/empty.js") },
    logLevel: "error",
  });
  const lib = await import(pathToFileURL(outfile).href);
  return { lib, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Teste ao vivo de uma fonte com configuração: robots + download + extração. */
async function liveCheck(lib, entry, now) {
  const deps = lib.crawlDeps({ repo: { hitRateLimit: async () => true } });
  const limits = { bucket: `activate:${entry.slug}`, limitPerHour: 100 };
  const empty = { robotsAllowed: true, crawlDelaySec: null, verdict: null, fetchError: null, items: [] };

  let url;
  try {
    url = new URL(entry.feedUrl);
  } catch {
    return { ...empty, fetchError: `feedUrl inválida: ${entry.feedUrl}` };
  }
  if (await lib.isForbiddenTarget(url, deps.resolve)) {
    return { ...empty, fetchError: "endereço não permitido (SSRF)" };
  }
  const isSitemap = entry.strategy === "sitemap_news";
  const target = isSitemap ? lib.resolveYearlySitemapUrl(entry.feedUrl, now) : entry.feedUrl;

  const robots = await lib.checkRobots(deps, target, limits);
  if (robots.kind === "unavailable") return { ...empty, fetchError: `robots.txt indisponível: ${robots.reason}` };
  if (robots.kind === "rate_limited") return { ...empty, fetchError: "limite de requisições atingido" };
  if (robots.kind === "disallowed") return { ...empty, robotsAllowed: false };
  const crawlDelaySec = lib.crawlDelayFromRobots(robots.robotsTxt, deps.userAgent);
  const base = { ...empty, crawlDelaySec };
  await sleep(Math.max(1000, (crawlDelaySec ?? 0) * 1000));

  const res = await lib.crawlGet(deps, target, isSitemap ? { ...limits, prefixBytes: lib.SITEMAP_PREFIX_BYTES } : limits);
  switch (res.kind) {
    case "http_error":
      return { ...base, fetchError: `HTTP ${res.status} em ${target}` };
    case "network_error":
      return { ...base, fetchError: `sem resposta de ${target}: ${res.message}` };
    case "too_large":
      return { ...base, fetchError: "documento maior que 5 MB" };
    case "rate_limited":
      return { ...base, fetchError: "limite de requisições atingido" };
    case "not_modified":
      return { ...base, fetchError: "resposta 304 sem corpo" };
    case "ok":
      break;
  }
  const format = lib.detectFormat(res.body);
  if (!format) return { ...base, fetchError: `formato não reconhecido em ${target}` };
  const wantsHtml = entry.strategy === "page_list" || entry.strategy === "page_article";
  if (wantsHtml !== (format === "html")) {
    return { ...base, fetchError: `esperava ${wantsHtml ? "HTML" : "feed/sitemap"} e veio ${format} em ${target}` };
  }
  const entries =
    format === "html" && entry.strategy === "page_list"
      ? lib.extractPageList(res.body, res.url, entry.pageSelectors)
      : lib.extractEntries(res.body, format, res.url);
  const items = entries.map((e) => ({ title: e.title, url: e.url, publishedAt: e.publishedAt }));
  return { ...base, items, verdict: lib.evaluateExtraction(items, entry.expect, now) };
}

async function openDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return { db: createClient(url, key, { auth: { persistSession: false } }), host: new URL(url).host };
}

const COLS =
  "id, slug, version, status, status_reason, archived_at, kind, feed_url, consumption, terms_url, terms_reviewed_at, frequency_minutes, rate_limit_per_hour, terms_min_interval_minutes, last_error";

async function rpc(db, fn, args) {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

/** Aplica o desfecho de uma fonte. Devolve uma frase do que fez. */
async function applyOutcome({ lib, db, row, outcome, ctx }) {
  if (row.archived_at) return "ignorada: fonte arquivada";
  if (row.status === "blocked") return "ignorada: fonte bloqueada (desbloqueio é manual)";

  if (outcome.action === "keep_paused") {
    if (row.status !== "paused") return `não alterada: está ${row.status}, e o teste falhou (${outcome.lastError})`;
    if (row.status_reason === outcome.statusReason && row.last_error === outcome.lastError) return "sem mudança (já pausada com este motivo)";
    const { error } = await db
      .from("sources")
      .update({ status_reason: outcome.statusReason, last_error: outcome.lastError })
      .eq("id", row.id)
      .eq("version", row.version);
    if (error) throw new Error(`update motivo: ${error.message}`);
    return `mantida pausada (${outcome.statusReason})`;
  }

  let version = row.version;
  const notes = [];
  let diff = lib.diffPatch(outcome.patch, row);
  if (row.status === "paused" && !row.terms_reviewed_at && !diff.terms_reviewed_at) {
    diff = { ...diff, terms_reviewed_at: outcome.patch.terms_reviewed_at, agreement_note: outcome.patch.agreement_note };
  }
  if (Object.keys(diff).length > 0) {
    version = await rpc(db, "source_admin_update", { p_id: row.id, p_version: version, p_patch: diff, p_ctx: ctx });
    notes.push(`configuração gravada (${Object.keys(diff).join(", ")})`);
  }
  if (row.status === "paused") {
    await rpc(db, "source_admin_status", { p_id: row.id, p_version: version, p_action: "resume", p_reason: null, p_ctx: ctx });
    notes.push("ativada");
  }
  // `last_error` de uma tentativa antiga não deve sobreviver a uma ativação.
  if (row.last_error && notes.includes("ativada")) {
    const { error } = await db.from("sources").update({ last_error: null }).eq("id", row.id);
    if (error) throw new Error(`limpar last_error: ${error.message}`);
  }
  return notes.length ? notes.join("; ") : "sem mudança (já configurada e ativa)";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { lib, cleanup } = await loadLib();
  try {
    const file = lib.parseActivationFile(JSON.parse(await readFile(args.config, "utf8")));
    const entries = file.sources.filter((s) => !args.only || args.only.includes(s.slug));
    if (args.only) {
      const missing = args.only.filter((s) => !file.sources.some((e) => e.slug === s));
      if (missing.length) throw new Error(`--only: slug fora do arquivo: ${missing.join(", ")}`);
    }

    const conn = await openDb();
    if (args.apply && !conn) {
      console.error("--apply precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.");
      process.exit(2);
    }
    console.log(`${args.apply ? "APLICAR" : "DRY-RUN"} · ${entries.length} fonte(s) · banco: ${conn ? conn.host : "(sem acesso: só rede)"}`);

    const ctx = { reason: `${file.decision}: ativação das fontes pausadas`, batchId: randomUUID() };
    const results = [];
    const sqlOut = [];
    let failures = 0;
    for (const entry of entries) {
      const now = new Date();
      let check = { robotsAllowed: true, crawlDelaySec: null, verdict: null, fetchError: null, items: [] };
      if (!entry.blocked) {
        try {
          check = await liveCheck(lib, entry, now);
        } catch (e) {
          check = { ...check, fetchError: `erro inesperado no teste: ${e instanceof Error ? e.message : String(e)}` };
        }
        await sleep(2000);
      }
      const outcome = lib.decideOutcome(entry, file, check, now);
      const line = {
        slug: entry.slug,
        mode: entry.strategy ?? "-",
        result: outcome.action === "activate" ? "ATIVA" : "PAUSADA",
        statusReason: outcome.action === "activate" ? null : outcome.statusReason,
        detail: outcome.action === "activate" ? `${check.verdict.valid} itens válidos de ${check.verdict.total}` : outcome.lastError,
        crawlDelaySec: check.crawlDelaySec,
        sample: check.items.slice(0, 3),
        applied: null,
      };
      if (args.emitSql && outcome.action === "activate") {
        const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
        const pt = outcome.patch;
        sqlOut.push(
          `update sources set kind = ${q(pt.kind)}, feed_url = ${q(pt.feed_url)}, consumption = ${q(JSON.stringify(pt.consumption ?? {}))}::jsonb, terms_url = ${q(pt.terms_url)}, terms_reviewed_at = ${pt.terms_reviewed_at ? q(pt.terms_reviewed_at) : "now()"}, frequency_minutes = ${Number(pt.frequency_minutes ?? 60)}, rate_limit_per_hour = ${Number(pt.rate_limit_per_hour ?? 20)}, agreement_note = ${q(pt.agreement_note)}, status = 'active', status_reason = null, last_error = null, status_changed_at = now(), version = version + 1 where slug = ${q(entry.slug)} and status = 'paused';`,
        );
      }
      if (conn) {
        const { data: row, error } = await conn.db.from("sources").select(COLS).eq("slug", entry.slug).maybeSingle();
        if (error) throw new Error(`select ${entry.slug}: ${error.message}`);
        if (!row) {
          line.applied = "fonte não existe no banco";
        } else if (args.apply) {
          try {
            line.applied = await applyOutcome({ lib, db: conn.db, row, outcome, ctx });
          } catch (e) {
            failures++;
            line.applied = `ERRO: ${e instanceof Error ? e.message : String(e)}`;
          }
        } else if (outcome.action === "activate") {
          const d = lib.diffPatch(outcome.patch, row);
          line.applied = `(dry-run) status atual ${row.status}; mudaria: ${Object.keys(d).join(", ") || "nada"}${row.status === "paused" ? "; ativaria" : ""}`;
        } else {
          line.applied = `(dry-run) status atual ${row.status}/${row.status_reason ?? "-"}`;
        }
      }
      results.push(line);
      console.log(`\n[${line.result}] ${line.slug} (${line.mode})${line.statusReason ? ` · ${line.statusReason}` : ""}`);
      console.log(`  ${line.detail}`);
      for (const s of line.sample) console.log(`    - ${s.publishedAt ?? "sem data"} | ${s.title.slice(0, 80)} | ${s.url}`);
      if (line.crawlDelaySec != null) console.log(`  Crawl-delay: ${line.crawlDelaySec}s`);
      if (line.applied) console.log(`  banco: ${line.applied}`);
    }

    const active = results.filter((r) => r.result === "ATIVA").length;
    console.log(`\nResumo: ${active} ativável(is), ${results.length - active} pausada(s)${args.apply ? "" : " · nada foi gravado (dry-run)"}`);
    if (args.emitSql) await writeFile(args.emitSql, sqlOut.join("\n") + "\n");
    if (args.report) await writeFile(args.report, JSON.stringify({ at: new Date().toISOString(), apply: args.apply, results }, null, 2));
    if (failures) process.exit(1);
  } finally {
    await cleanup();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
