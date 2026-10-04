#!/usr/bin/env node
// Libera o acúmulo de matérias em `in_review` (AUT-T8, parte de script).
//
// Reenfileira a etapa `rules` das matérias do pipeline paradas em revisão, em lotes de 50, e
// acompanha o disjuntor de publicação (60 por hora, 800 por dia, denúncias, IA). Por padrão faz um
// ENSAIO (`--dry-run`): só lê e mostra o que faria. Para escrever na fila é preciso `--apply`, e
// contra um banco que não é local, também `--confirm-host=<host>`.
//
//   node --env-file=.env.local scripts/release-backlog.mjs                  # ensaio
//   node --env-file=.env.local scripts/release-backlog.mjs --apply          # local
//   node --env-file=.env.prod  scripts/release-backlog.mjs --apply --confirm-host=<projeto>.supabase.co
//
// Variáveis: NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.
// NÃO ativa as regras v3 (isso é do dono, no painel de governança) e se recusa a liberar com as
// regras antigas ativas (as matérias voltariam para a revisão): `--allow-legacy-rules` ignora.
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

export const DEFAULTS = Object.freeze({
  batch: 50,
  maxBatches: Infinity,
  pollSec: 10,
  timeoutSec: 600,
  maxAgeDays: 0,
});

const HELP = `Uso: release-backlog.mjs [--dry-run | --apply] [opções]
  --dry-run              (padrão) só lê e mostra o plano, sem escrever nada
  --apply                enfileira a etapa "rules" dos itens em in_review, em lotes
  --confirm-host=<host>  obrigatório com --apply fora do banco local
  --batch=<n>            tamanho do lote (padrão 50, máximo 100)
  --max-batches=<n>      para depois de n lotes
  --max-age-days=<n>     só matérias que entraram em revisão nos últimos n dias (padrão 0 = todas)
  --poll-sec=<n>         intervalo de leitura enquanto o lote processa (padrão 10)
  --timeout-sec=<n>      espera máxima por lote (padrão 600)
  --wait                 com o teto da hora cheio, espera a janela abrir em vez de parar
  --allow-legacy-rules   libera mesmo com as regras antigas (v1/v2) ativas
  --out=<arquivo.json>   grava o relatório em JSON
`;

/** @typedef {{ apply: boolean, batch: number, maxBatches: number, maxAgeDays: number, pollSec: number, timeoutSec: number, wait: boolean, allowLegacyRules: boolean, confirmHost: string | null, out: string | null, help: boolean }} Options */

const intArg = (name, raw, min, max) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`--${name} precisa ser um inteiro de ${min} a ${max}`);
  return n;
};

/**
 * Argumentos da linha de comando. `--dry-run` é o padrão; `--apply` é explícito e não convive com
 * `--dry-run`. Opção desconhecida é erro (nada de erro de digitação virar escrita).
 * @param {string[]} argv
 * @returns {Options}
 */
export function parseArgs(argv) {
  /** @type {Options} */
  const o = {
    apply: false,
    batch: DEFAULTS.batch,
    maxBatches: DEFAULTS.maxBatches,
    maxAgeDays: DEFAULTS.maxAgeDays,
    pollSec: DEFAULTS.pollSec,
    timeoutSec: DEFAULTS.timeoutSec,
    wait: false,
    allowLegacyRules: false,
    confirmHost: null,
    out: null,
    help: false,
  };
  let dry = false;
  for (const a of argv) {
    const [k, v] = a.split(/=(.*)/s, 2);
    switch (k) {
      case "--apply":
        o.apply = true;
        break;
      case "--dry-run":
        dry = true;
        break;
      case "--wait":
        o.wait = true;
        break;
      case "--allow-legacy-rules":
        o.allowLegacyRules = true;
        break;
      case "--help":
      case "-h":
        o.help = true;
        break;
      case "--batch":
        o.batch = intArg("batch", v, 1, 100);
        break;
      case "--max-batches":
        o.maxBatches = intArg("max-batches", v, 1, 10_000);
        break;
      case "--max-age-days":
        o.maxAgeDays = intArg("max-age-days", v, 0, 3650);
        break;
      case "--poll-sec":
        o.pollSec = intArg("poll-sec", v, 1, 600);
        break;
      case "--timeout-sec":
        o.timeoutSec = intArg("timeout-sec", v, 10, 7200);
        break;
      case "--confirm-host":
        o.confirmHost = v ?? "";
        break;
      case "--out":
        o.out = v ?? "";
        break;
      default:
        throw new Error(`opção desconhecida: ${a}\n\n${HELP}`);
    }
  }
  if (o.apply && dry) throw new Error("--apply e --dry-run não combinam");
  return o;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * `--apply` só escreve em banco local, ou no host que a pessoa confirmou por extenso.
 * @param {string} url
 * @param {Options} o
 * @returns {string | null} motivo da recusa, ou `null` se pode seguir
 */
export function applyGuard(url, o) {
  if (!o.apply) return null;
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return `URL do Supabase inválida: ${url}`;
  }
  if (LOCAL_HOSTS.has(host)) return null;
  if (o.confirmHost === host) return null;
  return `--apply contra ${host} exige --confirm-host=${host}`;
}

/**
 * Quantas matérias cabem agora sem passar do teto da hora e do dia (mesmos limites do disjuntor).
 * @param {{ batch: number, counts: { publishedLastHour: number, publishedToday: number }, limits: { hourly: number, daily: number } }} p
 */
export function roomFor({ batch, counts, limits }) {
  return Math.max(
    0,
    Math.min(batch, limits.hourly - counts.publishedLastHour, limits.daily - counts.publishedToday),
  );
}

/**
 * O disjuntor está aberto, ou a próxima publicação o abriria por denúncia ou falha de IA? (O teto
 * de volume vira espera em `roomFor`.)
 * @param {{ publishedLastHour: number, publishedToday: number, reportsLastHour: number, aiCallsLastHour: number, aiFailuresLastHour: number }} counts
 * @param {{ hourly: number, daily: number, reportsPerHour: number, aiFailuresPerHour: number }} limits
 * @param {string | null} trippedAt
 * @returns {"tripped" | "reports" | "ai_failures" | null}
 */
export function breakerBlock(counts, limits, trippedAt) {
  if (trippedAt) return "tripped";
  if (counts.reportsLastHour >= limits.reportsPerHour) return "reports";
  if (
    counts.aiFailuresLastHour >= limits.aiFailuresPerHour &&
    counts.aiCallsLastHour > 0 &&
    counts.aiFailuresLastHour / counts.aiCallsLastHour >= 0.5
  )
    return "ai_failures";
  return null;
}

/**
 * Quando abre vaga na hora: a publicação mais antiga da janela sai 1 h depois de publicada.
 * @param {string[]} publishedAtLastHour ISO das publicações automáticas da última hora
 * @param {number} hourly
 * @param {number} need quantas vagas se quer
 * @returns {Date | null}
 */
export function nextWindowAt(publishedAtLastHour, hourly, need = 1) {
  const sorted = publishedAtLastHour.map((s) => Date.parse(s)).sort((a, b) => a - b);
  // Para ter `need` vagas é preciso sair (publicadas + need - hourly) publicações da janela.
  const mustLeave = sorted.length + need - hourly;
  if (mustLeave <= 0) return null;
  const t = sorted[mustLeave - 1];
  return t === undefined ? null : new Date(t + 3_600_000);
}

const CUIABA_OFFSET_MS = -4 * 3_600_000;

/** Rótulo "dd/mm HH h" da hora (America/Cuiaba, UTC−4 sem horário de verão). */
export function hourLabel(ms) {
  const d = new Date(ms + CUIABA_OFFSET_MS);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}h`;
}

/**
 * Publicadas por hora (fuso de Cuiabá), da mais antiga para a mais recente, com as horas vazias.
 * @param {string[]} publishedAt ISO das publicações automáticas
 * @param {Date} now
 * @param {number} hours janela em horas (padrão 24)
 */
export function hourlyReport(publishedAt, now, hours = 24) {
  const HOUR = 3_600_000;
  const endBucket = Math.floor((now.getTime() + CUIABA_OFFSET_MS) / HOUR);
  const rows = [];
  for (let i = hours - 1; i >= 0; i--) {
    const bucket = endBucket - i;
    rows.push({ hour: hourLabel(bucket * HOUR - CUIABA_OFFSET_MS), count: 0, bucket });
  }
  const byBucket = new Map(rows.map((r) => [r.bucket, r]));
  for (const iso of publishedAt) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    const row = byBucket.get(Math.floor((ms + CUIABA_OFFSET_MS) / HOUR));
    if (row) row.count++;
  }
  return rows.map(({ hour, count }) => ({ hour, count }));
}

/** Motivos de revisão mais comuns (texto cortado em 90 caracteres). */
export function summarizeReasons(reasons, top = 8) {
  const m = new Map();
  for (const r of reasons) {
    const k = (r ?? "(sem motivo)").replace(/\s+/g, " ").slice(0, 90);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([reason, count]) => ({ reason, count }));
}

/**
 * Regras v3 (autonomia alta)? Pelo efeito: nada fixo em `neverAuto` e breaking e sensível sem
 * portão. Corpo antigo (sem os campos) ou com `neverAuto: ["seguranca"]` ainda retém segurança.
 */
export function rulesAreV3(body) {
  return (
    body !== null &&
    typeof body === "object" &&
    Array.isArray(body.neverAuto) &&
    body.neverAuto.length === 0 &&
    body.breakingReview === false &&
    body.sensitiveFlagReview === false
  );
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

function check(what, error) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

/**
 * Matérias elegíveis: do pipeline, em revisão, sem edição humana e sem rascunho sem IA.
 * @returns {Promise<{ id: string, updated_at: string, review_reason: string | null, section_slug: string }[]>}
 */
export async function eligible(db, o, now) {
  let q = db
    .from("articles")
    .select("id, updated_at, review_reason, section_slug, agent_id, ai_fallback, publish_mode")
    .eq("status", "in_review")
    .is("publish_mode", null)
    .eq("ai_fallback", false)
    .not("agent_id", "is", null)
    .not("topic_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (o.maxAgeDays > 0)
    q = q.gte("updated_at", new Date(now.getTime() - o.maxAgeDays * 86_400_000).toISOString());
  const { data, error } = await q;
  check("ler matérias em revisão", error);
  const rows = data ?? [];
  const human = new Set();
  for (const ids of chunk(
    rows.map((r) => r.id),
    200,
  )) {
    const r = await db.from("article_versions").select("article_id").eq("origin", "human").in("article_id", ids);
    check("ler edições humanas", r.error);
    for (const v of r.data ?? []) human.add(v.article_id);
  }
  return rows.filter((r) => !human.has(r.id));
}

async function snapshot(db, now) {
  const { data, error } = await db.rpc("publish_counts", { p_now: now.toISOString() });
  check("ler contadores do disjuntor (migration 0073 aplicada?)", error);
  return data;
}

async function context(db, now) {
  const [rules, flags, counts] = await Promise.all([
    db.from("rules").select("version, body, force_review").eq("active", true).limit(2),
    db.from("feature_flags").select("key, enabled").in("key", ["auto_publish", "read_only"]),
    snapshot(db, now),
  ]);
  check("ler regras ativas", rules.error);
  check("ler flags", flags.error);
  const active = rules.data ?? [];
  const flag = Object.fromEntries((flags.data ?? []).map((f) => [f.key, f.enabled]));
  return {
    rules: active.length === 1 ? { version: active[0].version, v3: rulesAreV3(active[0].body), forceReview: active[0].force_review } : null,
    rulesCount: active.length,
    autoPublish: flag.auto_publish === true,
    readOnly: flag.read_only === true,
    counts,
  };
}

async function publishedLast24h(db, now) {
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const { data, error } = await db
    .from("articles")
    .select("published_at")
    .eq("publish_mode", "auto")
    .gte("published_at", since)
    .limit(5000);
  check("ler publicações automáticas", error);
  return (data ?? []).map((r) => r.published_at);
}

async function publishedLastHourTimes(db, now) {
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const { data, error } = await db
    .from("articles")
    .select("published_at")
    .eq("publish_mode", "auto")
    .gte("published_at", since)
    .limit(5000);
  check("ler publicações da hora", error);
  return (data ?? []).map((r) => r.published_at);
}

/** Espera o lote assentar: cada matéria com decisão de regras nova e, se for publicar, de publicação. */
async function waitBatch(db, ids, startedAt, o, { now, sleep, log }) {
  const deadline = now().getTime() + o.timeoutSec * 1000;
  /** @type {Map<string, "published" | "review" | "hold" | "pending">} */
  let state = new Map(ids.map((id) => [id, "pending"]));
  for (;;) {
    const { data: arts, error } = await db.from("articles").select("id, status, publish_mode").in("id", ids);
    check("acompanhar o lote", error);
    const refs = ids.map((id) => `article:${id}`);
    const { data: decs, error: e2 } = await db
      .from("decisions")
      .select("object_ref, step, output, created_at")
      .in("object_ref", refs)
      .in("step", ["rules", "publish"])
      .gte("created_at", startedAt)
      .order("created_at", { ascending: true });
    check("acompanhar as decisões", e2);
    const byRef = new Map();
    for (const d of decs ?? []) {
      const e = byRef.get(d.object_ref) ?? {};
      e[d.step] = d;
      byRef.set(d.object_ref, e);
    }
    state = new Map();
    for (const a of arts ?? []) {
      const e = byRef.get(`article:${a.id}`) ?? {};
      if (a.status === "published" && a.publish_mode === "auto") state.set(a.id, "published");
      else if (!e.rules) state.set(a.id, "pending");
      else if (e.rules.output?.route === "hold") state.set(a.id, "hold");
      else if (e.rules.output?.route === "review") state.set(a.id, "review");
      else if (e.publish && e.publish.output?.published === false) state.set(a.id, "review");
      else state.set(a.id, "pending");
    }
    const pending = [...state.values()].filter((s) => s === "pending").length;
    if (pending === 0) return { state, timedOut: false };
    if (now().getTime() >= deadline) return { state, timedOut: true };
    log(`  aguardando o worker: ${ids.length - pending}/${ids.length} resolvidas…`);
    await sleep(o.pollSec * 1000);
  }
}

/**
 * Executa o ensaio ou a liberação. Dependências injetáveis (`now`, `sleep`, `log`) para teste.
 * @param {Options} o
 */
export async function run(o, deps) {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? sleepMs;
  const log = deps.log ?? ((s) => console.log(s));
  const report = {
    mode: o.apply ? "apply" : "dry-run",
    startedAt: now().toISOString(),
    rules: null,
    flags: null,
    breaker: null,
    backlogBefore: 0,
    eligibleBefore: 0,
    reasons: [],
    batches: [],
    published: 0,
    stillInReview: 0,
    stoppedBecause: null,
    hourly: [],
    backlogAfter: 0,
  };

  const ctx = await context(db, now());
  report.rules = ctx.rules;
  report.flags = { autoPublish: ctx.autoPublish, readOnly: ctx.readOnly };
  report.breaker = { ...ctx.counts };

  const all = await eligible(db, o, now());
  const { count: backlog } = await db.from("articles").select("*", { count: "exact", head: true }).eq("status", "in_review");
  report.backlogBefore = backlog ?? all.length;
  report.eligibleBefore = all.length;
  report.reasons = summarizeReasons(all.map((a) => a.review_reason));

  const warnings = [];
  if (ctx.rulesCount !== 1) warnings.push(`regras ativas: ${ctx.rulesCount} (esperado 1); o pipeline falha fechado`);
  else if (!ctx.rules.v3 && !o.allowLegacyRules)
    warnings.push(`regras v${ctx.rules.version} (antigas) ativas: as matérias voltariam para a revisão; o dono precisa ativar a v3 antes`);
  if (!ctx.autoPublish) warnings.push("auto_publish desligado: nada publica sozinho");
  if (ctx.readOnly) warnings.push("modo leitura ligado");
  const block = breakerBlock(ctx.counts, ctx.counts.limits, ctx.counts.trippedAt);
  if (block) warnings.push(`disjuntor: ${block}`);
  report.warnings = warnings;

  const perHour = Math.min(ctx.counts.limits.hourly, ctx.counts.limits.daily);
  log(`\n== release-backlog (${report.mode}) ==`);
  log(`regras ativas: ${ctx.rules ? `v${ctx.rules.version}${ctx.rules.v3 ? " (v3)" : " (antigas)"}` : "nenhuma/várias"}`);
  log(`auto_publish: ${ctx.autoPublish ? "ligado" : "desligado"} · modo leitura: ${ctx.readOnly ? "sim" : "não"}`);
  log(`disjuntor: ${ctx.counts.trippedAt ? "ABERTO" : "fechado"} · na hora ${ctx.counts.publishedLastHour}/${ctx.counts.limits.hourly} · no dia ${ctx.counts.publishedToday}/${ctx.counts.limits.daily}`);
  log(`em revisão: ${report.backlogBefore} · elegíveis: ${all.length} (sem edição humana nem rascunho sem IA)`);
  log(`lotes de ${o.batch}: ${Math.ceil(all.length / o.batch)}; no teto de ${perHour} por hora leva cerca de ${Math.ceil(all.length / Math.max(1, perHour))} h`);
  if (report.reasons.length) {
    log("motivos de revisão mais comuns:");
    for (const r of report.reasons) log(`  ${String(r.count).padStart(4)}  ${r.reason}`);
  }
  for (const w of warnings) log(`AVISO: ${w}`);

  if (!o.apply) {
    log("\nENSAIO: nada foi escrito. Use --apply para liberar.");
    report.hourly = hourlyReport(await publishedLast24h(db, now()), now());
    return finish(report, o, log);
  }

  if (ctx.rulesCount !== 1 || (!ctx.rules.v3 && !o.allowLegacyRules)) {
    report.stoppedBecause = "regras não são a v3";
    return finish(report, o, log);
  }
  if (!ctx.autoPublish || ctx.readOnly) {
    report.stoppedBecause = "auto_publish desligado ou modo leitura";
    return finish(report, o, log);
  }

  const attempted = new Set();
  const runId = `backlog-${now().toISOString().replace(/\D/g, "").slice(0, 14)}`;
  for (let n = 1; n <= o.maxBatches; n++) {
    const snap = await snapshot(db, now());
    const blocked = breakerBlock(snap, snap.limits, snap.trippedAt);
    if (blocked) {
      report.stoppedBecause = `disjuntor (${blocked})`;
      break;
    }
    const room = roomFor({ batch: o.batch, counts: snap, limits: snap.limits });
    if (room <= 0) {
      const when = nextWindowAt(await publishedLastHourTimes(db, now()), snap.limits.hourly, 1);
      if (o.wait && when) {
        const ms = Math.max(1000, when.getTime() - now().getTime() + 5000);
        log(`teto da hora cheio (${snap.publishedLastHour}/${snap.limits.hourly}); espero ${Math.ceil(ms / 60000)} min…`);
        await sleep(ms);
        n--;
        continue;
      }
      report.stoppedBecause = `teto de volume (${snap.publishedLastHour}/${snap.limits.hourly} na hora, ${snap.publishedToday}/${snap.limits.daily} no dia)${when ? `; tente de novo depois de ${when.toISOString()}` : ""}`;
      break;
    }
    const next = (await eligible(db, o, now())).filter((a) => !attempted.has(a.id)).slice(0, room);
    if (next.length === 0) {
      report.stoppedBecause = "nada mais a liberar";
      break;
    }
    const ids = next.map((a) => a.id);
    const startedAt = now().toISOString();
    for (const id of ids) {
      attempted.add(id);
      const { error } = await db.rpc("queue_enqueue", {
        p_queue: "pipeline",
        p_dedupe_key: `rules:article:${id}`,
        p_message: { runId, step: "rules", itemRef: `article:${id}`, attempt: 1 },
        p_delay_sec: 0,
      });
      check("enfileirar a etapa rules", error);
    }
    log(`\nlote ${n}: ${ids.length} matérias na fila (vaga ${room}); aguardando o worker…`);
    const { state, timedOut } = await waitBatch(db, ids, startedAt, o, { now, sleep, log });
    const counts = { published: 0, review: 0, hold: 0, pending: 0 };
    for (const s of state.values()) counts[s]++;
    report.batches.push({ n, size: ids.length, ...counts, timedOut });
    report.published += counts.published;
    log(`lote ${n}: publicadas ${counts.published} · em revisão ${counts.review} · retidas ${counts.hold} · sem resposta ${counts.pending}`);
    if (timedOut) {
      report.stoppedBecause = `o worker não terminou o lote ${n} em ${o.timeoutSec}s`;
      break;
    }
  }

  const after = await eligible(db, o, now());
  const { count: backlogAfter } = await db.from("articles").select("*", { count: "exact", head: true }).eq("status", "in_review");
  report.backlogAfter = backlogAfter ?? after.length;
  report.stillInReview = after.length;
  report.hourly = hourlyReport(await publishedLast24h(db, now()), now());
  report.breaker = { ...(await snapshot(db, now())) };
  await notifyBacklogReleased(db, report, o);
  return finish(report, o, log);
}

/** Cadastra no sino (central de notificações, BELL-T1) que o backlog foi liberado. Nunca derruba. */
async function notifyBacklogReleased(db, report, o) {
  if (report.mode !== "apply" || !report.published) return;
  try {
    await db.rpc("studio_notify", {
      p_kind: "backlog_released",
      p_severity: "info",
      p_title: `Backlog liberado: ${report.published} matérias publicadas`,
      p_body: `Ainda em revisão: ${report.backlogAfter ?? 0}.`,
      p_href: "/estudio/fila",
      p_object_ref: "queue:review",
      p_roles: ["admin", "editor_chefe"],
      p_dedupe: `backlog:${report.startedAt ?? ""}:${report.finishedAt ?? Date.now()}`,
    });
  } catch {
    /* o aviso é um extra; a liberação já aconteceu */
  }
}

async function finish(report, o, log) {
  report.finishedAt = new Date().toISOString();
  if (report.hourly.length) {
    log("\npublicadas por hora (automáticas, últimas 24 h, fuso de Cuiabá):");
    for (const r of report.hourly) if (r.count > 0) log(`  ${r.hour}  ${"#".repeat(Math.min(60, r.count))} ${r.count}`);
    log(`  total ${report.hourly.reduce((s, r) => s + r.count, 0)}`);
  }
  if (report.mode === "apply") {
    log(`\nresumo: publicadas nesta execução ${report.published} · em revisão antes ${report.backlogBefore} · depois ${report.backlogAfter}`);
    if (report.stoppedBecause) log(`parou porque: ${report.stoppedBecause}`);
  }
  if (o.out) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(o.out, `${JSON.stringify(report, null, 2)}\n`);
    log(`relatório gravado em ${o.out}`);
  }
  return report;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log(HELP);
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("defina NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY");
  const refusal = applyGuard(url, o);
  if (refusal) throw new Error(refusal);
  console.log(`banco: ${new URL(url).hostname}`);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await run(o, { db });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
