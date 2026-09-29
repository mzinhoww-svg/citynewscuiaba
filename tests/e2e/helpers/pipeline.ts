/**
 * Ajudantes de pipeline para o e2e do painel de fontes (FS-T9). Só nos testes: falam com a
 * pilha local pela service role (chave lida de `.env.local`) e chamam as rotas de cron do servidor
 * de fixtures com o `CRON_SECRET`. Nada aqui existe em produção.
 *
 * - `failFetchTimes`: roda o `fetch` real da fonte (`runFetch`, mesma etapa do pipeline) em N runs
 *   manuais com um HTTP falso que responde 500 — reproduz "3 runs seguidos com falha" (D-F18)
 *   sem esperar os retries de 1, 4 e 10 min: cada run entra já na última tentativa.
 * - `fastTick`/`drain`: `POST /api/ingest/fast-tick` e `POST /api/jobs/drain` no servidor alvo.
 * - Leituras: notificações, itens coletados, runs e estado da fonte.
 */
import { existsSync, readFileSync } from "node:fs";
import Module from "node:module";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { DbClient } from "@/lib/db/browser";
import { MAX_ATTEMPTS } from "@/lib/pipeline/retry";
import type { HttpFetch } from "@/lib/pipeline/ports";
import { fakeResolve } from "@/lib/pipeline/testing/fake-http";

// `server-only` lança fora do bundler do Next (mesma solução do vitest.config.mts): no processo do
// Playwright o pacote vira o módulo vazio, para importar `pipeline-store`/`steps/fetch`.
type Resolver = (request: string, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolver };
const originalResolve = mod._resolveFilename;
mod._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return join(process.cwd(), "node_modules/server-only/empty.js");
  return originalResolve.call(this, request, ...rest);
};

function envFromLocal(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const file = join(process.cwd(), ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
      if (m && m[1] === name) return m[2]!;
    }
  }
  throw new Error(`${name} ausente (.env.local)`);
}

/** Cliente com a service role (só testes; ignora RLS). */
export function serviceClient(): DbClient {
  return createClient<Database>(
    envFromLocal("NEXT_PUBLIC_SUPABASE_URL"),
    envFromLocal("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function cronSecret(): string {
  return envFromLocal("CRON_SECRET");
}

/**
 * Módulos do servidor carregados só quando um teste os usa (depois do ajuste de `server-only`
 * acima). `require`, e não `import()`: o Playwright compila os specs para CommonJS e um
 * `import()` dinâmico cairia no carregador ESM do Node, que não entende `.ts` com aliases.
 */
function stores() {
  const db = serviceClient();
  /* eslint-disable @typescript-eslint/no-require-imports */
  const store = require("@/lib/db/pipeline-store") as typeof import("@/lib/db/pipeline-store");
  const fetchStep =
    require("@/lib/pipeline/steps/fetch") as typeof import("@/lib/pipeline/steps/fetch");
  /* eslint-enable @typescript-eslint/no-require-imports */
  return { db, store, fetchStep };
}

export interface SourceState {
  status: string;
  statusReason: string | null;
  consecutiveFailures: number;
  lastError: string | null;
}

export async function sourceState(slug: string): Promise<SourceState> {
  const { data, error } = await serviceClient()
    .from("sources")
    .select("status, status_reason, consecutive_failures, last_error")
    .eq("slug", slug)
    .single();
  if (error) throw new Error(error.message);
  return {
    status: data.status,
    statusReason: data.status_reason,
    consecutiveFailures: data.consecutive_failures,
    lastError: data.last_error,
  };
}

/**
 * N runs manuais seguidos em que a fonte responde `status` (padrão 500) na última tentativa do
 * `fetch`. Devolve o resultado de cada run e o estado final da fonte.
 */
export async function failFetchTimes(
  slug: string,
  times: number,
  status = 500,
): Promise<{ outcomes: string[]; state: SourceState }> {
  const { db, store, fetchStep } = stores();
  const repo = store.createIngestRepo(db);
  const runs = store.createRunStore(db);
  const { data: source, error } = await db.from("sources").select("id").eq("slug", slug).single();
  if (error) throw new Error(error.message);

  let requests = 0;
  const http: HttpFetch = async (url) => {
    requests++;
    if (new URL(url).pathname === "/robots.txt")
      return new Response("User-agent: *\nAllow: /\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    return new Response("erro interno simulado", { status });
  };
  const outcomes: string[] = [];
  for (let i = 0; i < times; i++) {
    const { runId } = await runs.startManualRun(source.id);
    const r = await fetchStep.runFetch(
      { runId, step: "fetch", itemRef: `source:${slug}`, attempt: MAX_ATTEMPTS },
      {
        repo,
        http,
        resolve: fakeResolve(),
        userAgent: "CityNewsBot/1.0 (e2e)",
        now: () => new Date(),
      },
    );
    outcomes.push(r.outcome);
  }
  if (requests === 0) throw new Error("o fetch falso nunca foi chamado");
  return { outcomes, state: await sourceState(slug) };
}

/** Limpa a última coleta e a trava de janela: a fonte volta a estar vencida em qualquer via. */
export async function resetFetchState(slug: string): Promise<void> {
  const { error } = await serviceClient()
    .from("sources")
    .update({
      last_fetched_at: null,
      last_fetch_started_at: null,
      last_fetch_run_id: null,
      etag: null,
      last_modified: null,
    })
    .eq("slug", slug);
  if (error) throw new Error(error.message);
}

export async function notificationsFor(sourceId: string, kind: string) {
  const { data, error } = await serviceClient()
    .from("notifications")
    .select("id, kind, channel, title, created_at")
    .eq("object_ref", `source:${sourceId}`)
    .eq("kind", kind)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function collectedCount(sourceId: string): Promise<number> {
  const { count, error } = await serviceClient()
    .from("collected_items")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function runsFor(sourceId: string, trigger: string) {
  const { data, error } = await serviceClient()
    .from("ingest_runs")
    .select("id, trigger, window_start, stats")
    .eq("trigger", trigger)
    .order("window_start", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  void sourceId;
  return data;
}

async function cronPost(baseURL: string, path: string, secret?: string) {
  const res = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* texto puro */
  }
  return { status: res.status, body };
}

export const fastTick = (baseURL: string, secret?: string) =>
  cronPost(baseURL, "/api/ingest/fast-tick", secret);
export const drain = (baseURL: string, secret?: string) =>
  cronPost(baseURL, "/api/jobs/drain", secret);
export const ingestStatus = async (baseURL: string, secret: string) => {
  const res = await fetch(`${baseURL}/api/ingest/status`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
