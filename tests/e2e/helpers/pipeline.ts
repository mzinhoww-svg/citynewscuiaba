import { readFileSync } from "node:fs";
import { join } from "node:path";
import "./server-only-stub";
import { createEventSink, createIngestRepo } from "@/lib/db/pipeline-store";
import { crawlerUserAgent } from "@/lib/pipeline/http";
import { createQueue } from "@/lib/pipeline/queue";
import { MAX_ATTEMPTS } from "@/lib/pipeline/retry";
import { createRunStep } from "@/lib/pipeline/run-step";
import { createIngestHandlers } from "@/lib/pipeline/steps";
import { createFakeHttp, fakeResolve } from "@/lib/pipeline/testing/fake-http";
import { fastWindowStart } from "@/lib/pipeline/window";
import { service } from "../studio";

/*
 * Coleta dentro do teste (FS-T9): o pipeline roda no processo do Playwright com a service role e
 * HTTP falso (fixtures `*.example`), nunca com rede. Serve para o que o painel só enfileira (Coletar
 * agora, tick da via rápida) e para simular falhas que o veículo real teria (HTTP 500).
 */

const FIXTURES = join(process.cwd(), "tests/fixtures");
const text = (file: string) => readFileSync(join(FIXTURES, file), "utf8");

/** Veículos fictícios e seus arquivos (mesma tabela de `http-deps.ts`, só o que os fluxos usam). */
export type SiteMode = "ok" | "http500";

export function chapadaRoutes(mode: SiteMode) {
  return {
    "https://jornaldachapada.example/robots.txt": {
      body: text("sites/jornal-da-chapada-robots.txt"),
      headers: { "content-type": "text/plain" },
    },
    "https://jornaldachapada.example/":
      mode === "ok"
        ? {
            body: text("sites/jornal-da-chapada-secao.html"),
            headers: { "content-type": "text/html" },
          }
        : { status: 500, body: "erro interno de teste" },
  };
}

/** Feed RSS fictício (o da Folha do Cerrado) servido por um host de teste, com o robots.txt dela. */
export function feedRoutes(host: string) {
  return {
    [`https://${host}/robots.txt`]: {
      body: text("sites/folha-robots.txt"),
      headers: { "content-type": "text/plain" },
    },
    [`https://${host}/feed`]: {
      body: text("feeds/folha-do-cerrado.xml"),
      headers: { "content-type": "application/rss+xml" },
    },
  };
}

type Routes = Record<string, { status?: number; body?: string; headers?: Record<string, string> }>;

function ingest(routes: Routes) {
  const db = service();
  const fakeHttp = createFakeHttp(routes);
  const handlers = createIngestHandlers({
    repo: createIngestRepo(db),
    http: fakeHttp.http,
    resolve: fakeResolve(),
    userAgent: crawlerUserAgent(),
    now: () => new Date(),
  });
  return { db, handlers, events: createEventSink(db), calls: fakeHttp.calls };
}

/**
 * Coleta final de uma fonte com o site respondendo `mode`: abre um run `manual` e executa o
 * `fetch` como a última tentativa (só ela conta para a pausa automática, D-F18). Devolve o
 * resultado do passo e a quantidade de requisições ao veículo.
 */
export async function failFetchOnce(slug: string, routes: Routes) {
  const { db, handlers, events, calls } = ingest(routes);
  const source = await db.from("sources").select("id").eq("slug", slug).single();
  if (source.error) throw source.error;
  const run = await db.rpc("start_manual_run", { p_source: source.data.id });
  if (run.error || !run.data) throw run.error ?? new Error("run manual não criado");
  const msg = {
    runId: run.data,
    step: "fetch" as const,
    itemRef: `source:${slug}:manual:${run.data}`,
    attempt: MAX_ATTEMPTS,
  };
  const res = await handlers.fetch?.(msg);
  await events.record([
    {
      runId: run.data,
      step: "fetch",
      itemRef: msg.itemRef,
      level: res && !res.ok ? "error" : "info",
      message: res && !res.ok ? res.error.message : "coleta concluída",
    },
  ]);
  return { runId: run.data, ok: res?.ok ?? false, requests: calls.length };
}

/**
 * Esvazia da fila `pipeline` só as mensagens dos runs dados (as de outros runs voltam sem contar
 * tentativa): executa `fetch → validate → extract → normalize` com HTTP falso, como o worker, e
 * grava os eventos que a aba Coleta lê. Etapas seguintes (dedupe em diante) terminam aqui: esses
 * testes não exercitam IA. Devolve quantas mensagens rodaram e as requisições ao veículo.
 */
export async function drainRuns(
  runIds: readonly string[],
  routes: Routes,
  only: { slug?: string } = {},
) {
  const { db, handlers, events, calls } = ingest(routes);
  const queue = createQueue(db);
  const runStep = createRunStep(handlers);
  let processed = 0;
  for (let round = 0; round < 8; round++) {
    const batch = await queue.readBatch("pipeline", 50, 30);
    if (batch.length === 0) break;
    let mine = 0;
    for (const q of batch) {
      const foreign = only.slug !== undefined && !q.msg.itemRef.startsWith(`source:${only.slug}`);
      if (!runIds.includes(q.msg.runId) || (foreign && q.msg.step === "fetch")) {
        await queue.release("pipeline", q.msgId);
        continue;
      }
      if (!handlers[q.msg.step]) {
        // Etapa que o teste não exercita (dedupe em diante, IA): sai da fila para não acumular.
        await queue.ack("pipeline", q.msgId);
        continue;
      }
      mine++;
      const res = await runStep(q.msg);
      await events.record([
        {
          runId: q.msg.runId,
          step: q.msg.step,
          itemRef: q.msg.itemRef,
          level: res.ok ? "info" : "error",
          message: res.ok ? `${q.msg.step} concluída` : res.error.message,
        },
      ]);
      if (res.ok) for (const next of res.value) await queue.enqueue("pipeline", next);
      await queue.ack("pipeline", q.msgId);
      processed++;
    }
    if (mine === 0) break;
  }
  return { processed, requests: calls.length };
}

/**
 * Zera o run `fast` da janela de 10 min atual (um por janela): repetir o teste dentro da mesma
 * janela não pode cair em "existing" sem enfileirar nada.
 */
export async function resetFastWindow() {
  const db = service();
  const window = fastWindowStart(new Date()).toISOString();
  const runs = await db
    .from("ingest_runs")
    .select("id")
    .eq("trigger", "fast")
    .eq("window_start", window);
  for (const r of runs.data ?? []) {
    await db.rpc("purge_pipeline_events", { p_run_ids: [r.id] });
    await db.from("jobs").delete().eq("message->>runId", r.id);
    await db.from("raw_items").delete().eq("run_id", r.id);
    const del = await db.from("ingest_runs").delete().eq("id", r.id);
    if (del.error) throw new Error(`run rápido antigo não removido: ${del.error.message}`);
  }
}

/** Chama a rota do tick da via rápida do servidor de testes (CRON_SECRET do `.env.local`). */
export async function callFastTick(baseURL: string) {
  const res = await fetch(`${baseURL}/api/ingest/fast-tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/**
 * Invalida o cache da home no servidor de testes (a home guarda 60 s, tag `home`): o teste que
 * acabou de gravar uma fonte ou um item pela service role vê o resultado na hora.
 */
export async function refreshHome(baseURL: string) {
  const queued = await service()
    .from("studio_revalidations")
    .insert({ tags: ["home"] });
  if (queued.error) throw queued.error;
  const res = await fetch(`${baseURL}/api/jobs/revalidate`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  if (!res.ok) throw new Error(`revalidação da home: HTTP ${res.status}`);
}
