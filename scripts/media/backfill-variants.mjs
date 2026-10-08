#!/usr/bin/env node
// Backfill das variantes por largura (UX-W5-T1, item 79).
//
// Para cada imagem do Media Registry que não está bloqueada, gera as variantes 480/960/1440 em
// WebP (qualidade 75, sem ampliar) que ainda faltam no bucket `media`, ao lado do original
// (`original/abc.jpg` → `original/abc.w480.webp`). Variante é cópia reduzida do MESMO ativo: não
// cria linha em `media_assets`, não muda status de direitos nem escopo de uso (CLAUDE.md §5.11).
// Idempotente: variante que já existe não é refeita. Por padrão faz um ENSAIO (`--dry-run`): só lê
// e mostra o que faria. Para gravar é preciso `--apply`, e contra um banco que não é local, também
// `--confirm-host=<host>`. Rodar em produção segue B-009 (registrado em .planning/DECISIONS.md).
//
//   node --env-file=.env.local scripts/media/backfill-variants.mjs                  # ensaio
//   node --env-file=.env.local scripts/media/backfill-variants.mjs --apply          # local
//   node --env-file=.env.prod  scripts/media/backfill-variants.mjs --apply --confirm-host=<projeto>.supabase.co
//
// Variáveis: NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.
import { pathToFileURL } from "node:url";

/** Mesmas larguras e caminho de `src/lib/media/variants.ts` (o teste confere a paridade). */
export const VARIANT_WIDTHS = Object.freeze([480, 960, 1440]);
export const QUALITY = 75;
const BUCKET = "media";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** @param {string} path @param {number} w */
export function variantPath(path, w) {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const base = dot > slash ? path.slice(0, dot) : path;
  return `${base}.w${w}.webp`;
}

/** @param {number} width */
export const variantWidthsFor = (width) => VARIANT_WIDTHS.filter((w) => w < width);

const HELP = `Uso: backfill-variants.mjs [--dry-run | --apply] [opções]
  --dry-run              (padrão) só lê e mostra o que faria, sem gravar nada
  --apply                gera e grava as variantes que faltam
  --confirm-host=<host>  obrigatório com --apply fora do banco local
  --batch=<n>            imagens lidas por página (padrão 100, máximo 500)
  --limit=<n>            para depois de n imagens
`;

/** @typedef {{ apply: boolean, batch: number, limit: number, confirmHost: string | null, help: boolean }} Options */

const intArg = (name, raw, min, max) => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new Error(`--${name} precisa ser um inteiro de ${min} a ${max}`);
  return n;
};

/**
 * `--dry-run` é o padrão; `--apply` é explícito e não convive com `--dry-run`. Opção desconhecida
 * é erro (nada de erro de digitação virar escrita).
 * @param {string[]} argv
 * @returns {Options}
 */
export function parseArgs(argv) {
  /** @type {Options} */
  const o = { apply: false, batch: 100, limit: Infinity, confirmHost: null, help: false };
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
      case "--batch":
        o.batch = intArg("batch", v, 1, 500);
        break;
      case "--limit":
        o.limit = intArg("limit", v, 1, 1_000_000);
        break;
      case "--confirm-host":
        o.confirmHost = v ?? "";
        break;
      case "--help":
      case "-h":
        o.help = true;
        break;
      default:
        throw new Error(`opção desconhecida: ${a}\n\n${HELP}`);
    }
  }
  if (o.apply && dry) throw new Error("--apply e --dry-run não combinam");
  return o;
}

/** Recusa `--apply` fora do banco local sem `--confirm-host` igual ao host. */
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
 * @typedef {{ id: string, storagePath: string, width: number | null }} AssetRow
 * @typedef {{
 *   listAssets(offset: number, limit: number): Promise<AssetRow[]>,
 *   exists(path: string): Promise<boolean>,
 *   download(path: string): Promise<Uint8Array | null>,
 *   upload(path: string, bytes: Uint8Array): Promise<boolean>,
 *   measure(bytes: Uint8Array): Promise<number | null>,
 *   resize(bytes: Uint8Array, width: number): Promise<Uint8Array>,
 *   log?: (line: string) => void,
 * }} Deps
 */

/**
 * Percorre as imagens e grava as variantes que faltam. Nunca apaga nada.
 * @param {Options} o
 * @param {Deps} deps
 */
export async function run(o, deps) {
  const log = deps.log ?? (() => {});
  const report = {
    mode: o.apply ? "apply" : "dry-run",
    assets: 0,
    complete: 0,
    planned: 0,
    written: 0,
    failed: 0,
    unreadable: 0,
  };
  let offset = 0;
  while (report.assets < o.limit) {
    const page = await deps.listAssets(offset, Math.min(o.batch, o.limit - report.assets));
    if (page.length === 0) break;
    offset += page.length;
    for (const a of page) {
      report.assets += 1;
      // Largura desconhecida: as três são candidatas; a medida do arquivo decide no --apply.
      const candidates = a.width ? variantWidthsFor(a.width) : [...VARIANT_WIDTHS];
      const missing = [];
      for (const w of candidates)
        if (!(await deps.exists(variantPath(a.storagePath, w)))) missing.push(w);
      if (missing.length === 0) {
        report.complete += 1;
        continue;
      }
      report.planned += missing.length;
      if (!o.apply) {
        log(`ensaio: ${a.id} faltam ${missing.join(", ")}`);
        continue;
      }
      const bytes = await deps.download(a.storagePath);
      const width = bytes ? (a.width ?? (await deps.measure(bytes))) : null;
      if (!bytes || !width) {
        report.unreadable += 1;
        log(`sem arquivo legível: ${a.id} (${a.storagePath})`);
        continue;
      }
      for (const w of missing.filter((x) => x < width)) {
        try {
          const ok = await deps.upload(variantPath(a.storagePath, w), await deps.resize(bytes, w));
          if (ok) report.written += 1;
          else report.failed += 1;
        } catch {
          report.failed += 1;
        }
      }
    }
  }
  return report;
}

/** Dependências reais: service role no Supabase e `sharp`. */
async function realDeps(db) {
  const { default: sharp } = await import("sharp");
  const bucket = () => db.storage.from(BUCKET);
  return {
    async listAssets(offset, limit) {
      const { data, error } = await db
        .from("media_assets")
        .select("id, storage_path, width")
        .neq("status", "blocked")
        .order("captured_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(`media_assets: ${error.message}`);
      return (data ?? []).map((r) => ({ id: r.id, storagePath: r.storage_path, width: r.width }));
    },
    async exists(path) {
      const slash = path.lastIndexOf("/");
      const dir = slash >= 0 ? path.slice(0, slash) : "";
      const name = path.slice(slash + 1);
      const { data, error } = await bucket().list(dir, { search: name, limit: 10 });
      if (error) throw new Error(`Storage: ${error.message}`);
      return (data ?? []).some((f) => f.name === name);
    },
    async download(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async upload(path, bytes) {
      const { error } = await bucket().upload(path, bytes, {
        contentType: "image/webp",
        upsert: true,
      });
      return !error;
    },
    async measure(bytes) {
      try {
        const meta = await sharp(bytes, { limitInputPixels: 80_000_000 }).metadata();
        return meta.autoOrient?.width ?? meta.width ?? null;
      } catch {
        return null;
      }
    },
    async resize(bytes, width) {
      return sharp(bytes, { limitInputPixels: 80_000_000 })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer();
    },
    log: (line) => console.log(line),
  };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log(HELP);
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("defina NEXT_PUBLIC_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY");
  const refusal = applyGuard(url, o);
  if (refusal) throw new Error(refusal);
  console.log(`banco: ${new URL(url).hostname} · modo: ${o.apply ? "apply" : "dry-run"}`);
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const report = await run(o, await realDeps(db));
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
