import { err, ok } from "@/lib/result";
import { afterFetch } from "@/lib/sources/status";
import { checkRobots, crawlGet, type CrawlDeps } from "../http";
import type { IngestRepo, SourceRecord } from "../ports";
import { MAX_ATTEMPTS } from "../retry";
import {
  nextMessage,
  stepError,
  type StepContext,
  type StepError,
  type StepHandler,
  type StepResult,
} from "../run-step";
import type { PipelineMessage } from "../types";
import { fastWindowStart } from "../window";

export interface IngestDeps extends CrawlDeps {
  repo: IngestRepo;
  now: () => Date;
  /** Relógio monotônico em ms para a latência (padrão `performance.now`). */
  monotonic?: () => number;
}

export const RATE_LIMITED = "limite de requisições por hora da fonte atingido; coleta adiada";

/** Dedupe da notificação de pausa automática (spec §7.3: `notify_once`, 10 min). */
export const AUTO_PAUSE_DEDUPE_SEC = 600;

/** URL coletada: o feed descoberto, ou a página inicial para fontes do tipo `page`. */
export function collectUrl(source: SourceRecord): string | null {
  return source.feedUrl ?? (source.kind === "page" ? source.baseUrl : null);
}

/**
 * Resultado do `fetch` para saúde e testes. `retry` = falha transitória antes da última
 * tentativa (não conta); `failed` = falha final (conta para a pausa automática); `skipped` =
 * fonte fora de `active`/`degraded` ou bloqueada pelo `robots.txt`; `already_fetched` = outra
 * coleta da fonte já começou na janela de 10 min (D-F29).
 */
export type FetchStepOutcome =
  | "ok"
  | "not_modified"
  | "retry"
  | "failed"
  | "rate_limited"
  | "skipped"
  | "already_fetched"
  | "not_found";

export interface FetchRun {
  outcome: FetchStepOutcome;
  result: StepResult;
}

/**
 * Etapa 2: baixa o documento da fonte (um `raw_items` por fonte e run). Coleta fontes `active` e
 * `degraded`; em runs `cron` e `fast`, só requisita depois de `claim_source_fetch` (runs `manual`
 * não passam pela trava). Respeita `robots.txt`, limite por hora e coleta condicional (ETag e
 * Last-Modified sempre que a fonte já os devolveu); 304 encerra sem item novo. O resultado final
 * (sucesso, 304, falha não transitória ou última tentativa de uma transitória, A-030) atualiza a
 * saúde (`record_source_fetch`) e o estado da fonte (`afterFetch`, D-F18): a 3ª falha seguida
 * pausa com `auto_failures` e notifica o Control Center.
 */
export async function runFetch(
  msg: PipelineMessage,
  deps: IngestDeps,
  ctx?: StepContext,
): Promise<FetchRun> {
  const slug = msg.itemRef.replace(/^source:/, "");
  const source = await deps.repo.sourceBySlug(slug);
  if (!source)
    return {
      outcome: "not_found",
      result: err(stepError.notFound(`fonte ${slug} não encontrada`)),
    };
  if (source.status !== "active" && source.status !== "degraded")
    return { outcome: "skipped", result: ok([]) };

  // Tentativa cortada pelo prazo do drain nunca é final: o drain a devolve à fila sem contar
  // tentativa (`queue_release`), e ela volta com o mesmo `attempt` (fix round 1, #1).
  const isFinal = () => msg.attempt >= MAX_ATTEMPTS && !ctx?.signal?.aborted;
  const clock = deps.monotonic ?? (() => performance.now());
  let started: number | null = null;
  const latency = () => (started === null ? null : Math.max(0, Math.round(clock() - started)));

  /** Falha: transitória antes da última tentativa só reagenda; o resto conta uma vez por run. */
  const failure = async (error: StepError): Promise<FetchRun> => {
    if (error.retryable && !isFinal()) return { outcome: "retry", result: err(error) };
    await countFinalFailure(deps.repo, source, msg.runId, error.message, latency());
    return { outcome: "failed", result: err(error) };
  };

  // Trava antes de qualquer contabilidade: dois ticks na mesma janela contam uma vez (#2).
  const trigger = (await deps.repo.runTrigger(msg.runId)) ?? "cron";
  if (trigger !== "manual") {
    const claimed = await deps.repo.claimFetch(source.id, msg.runId, fastWindowStart(deps.now()));
    if (!claimed) return { outcome: "already_fetched", result: ok([]) };
  }

  const url = collectUrl(source);
  if (!url) {
    const reason = "fonte sem feed descoberto: rode activateSource";
    await deps.repo.updateSource(source.id, { lastError: reason });
    return failure(stepError.invalid(reason));
  }

  const limits = {
    bucket: `crawler:${source.slug}`,
    limitPerHour: source.rateLimitPerHour,
    signal: ctx?.signal,
  };
  started = clock();

  const robots = await checkRobots(deps, url, limits);
  if (robots.kind === "unavailable") return failure(stepError.transient(robots.reason));
  if (robots.kind === "rate_limited") {
    await deps.repo.updateSource(source.id, { lastError: RATE_LIMITED });
    return { outcome: "rate_limited", result: ok([]) };
  }
  if (robots.kind === "disallowed") {
    await deps.repo.updateSource(source.id, { lastError: robots.reason });
    return { outcome: "skipped", result: ok([]) };
  }

  const res = await crawlGet(deps, url, {
    ...limits,
    etag: source.etag,
    lastModified: source.lastModified,
  });
  const fetchedAt = deps.now().toISOString();
  switch (res.kind) {
    case "rate_limited":
      await deps.repo.updateSource(source.id, { lastError: RATE_LIMITED });
      return { outcome: "rate_limited", result: ok([]) };
    case "not_modified": {
      await deps.repo.updateSource(source.id, { lastFetchedAt: fetchedAt, lastError: null });
      const first = await deps.repo.recordFetchOnce(
        source.id,
        msg.runId,
        "not_modified",
        latency(),
        null,
      );
      // A fonte respondeu: para o contador de falhas, 304 é sucesso (spec: "sucesso zera"). Sem
      // isto, uma fonte `degraded` que só devolve 304 ficava "Com falhas" até um 200 (achado M-2).
      if (first) await recoverIfUnhealthy(deps, source);
      return { outcome: "not_modified", result: ok([]) };
    }
    case "network_error":
      return failure(stepError.transient(res.message));
    case "too_large":
      await deps.repo.updateSource(source.id, { lastError: "documento maior que 5 MB" });
      return failure(stepError.invalid("documento maior que 5 MB"));
    case "http_error": {
      const reason = `HTTP ${res.status} em ${url}`;
      if (res.status === 429 || res.status >= 500) {
        if (isFinal()) await deps.repo.updateSource(source.id, { lastError: reason });
        return failure(stepError.transient(reason));
      }
      await deps.repo.updateSource(source.id, { lastError: reason });
      return failure(stepError.invalid(reason));
    }
    case "ok": {
      const ms = latency();
      const rawId = await deps.repo.insertRawItem({
        runId: msg.runId,
        sourceId: source.id,
        payload: {
          url: res.url,
          status: res.status,
          contentType: res.contentType,
          body: res.body,
          sourceKind: source.kind,
          etag: res.etag,
          lastModified: res.lastModified,
        },
      });
      // ETag/Last-Modified só no validate: se esta mensagem cair antes de enfileirar o validate,
      // a nova tentativa baixa o documento de novo em vez de receber 304.
      await deps.repo.updateSource(source.id, { lastFetchedAt: fetchedAt, lastError: null });
      // Itens novos entram na saúde pelo normalize (`items`), quando se sabe o que é novo.
      // Uma vez por (fonte, run): a nova tentativa depois de falha ao enfileirar o validate baixa
      // de novo, mas não conta outro "ok" (#7).
      const first = await deps.repo.recordFetchOnce(source.id, msg.runId, "ok", ms, null);
      if (first) await recoverIfUnhealthy(deps, source);
      return { outcome: "ok", result: ok([nextMessage(msg, "validate", `raw:${rawId}`)]) };
    }
  }
}

/** Sucesso (200 ou 304) zera o contador e volta a `active` quando a fonte não estava saudável. */
async function recoverIfUnhealthy(deps: IngestDeps, source: SourceRecord): Promise<void> {
  const alreadyHealthy =
    source.status === "active" && source.statusReason === null && source.consecutiveFailures === 0;
  if (alreadyHealthy) return;
  const patch = afterFetch(
    {
      status: source.status,
      statusReason: source.statusReason,
      consecutiveFailures: source.consecutiveFailures,
      archivedAt: null,
    },
    "ok",
  );
  if (patch) await deps.repo.applySourceState(source.id, patch);
}

/**
 * Falha final de uma coleta (D-F18): saúde e `afterFetch` uma vez por (fonte, run); a 3ª falha
 * seguida pausa com `auto_failures` e notifica o Control Center.
 */
async function countFinalFailure(
  repo: IngestRepo,
  source: SourceRecord,
  runId: string,
  message: string,
  latencyMs: number | null,
): Promise<void> {
  if (!(await repo.recordFetchOnce(source.id, runId, "failed", latencyMs, message))) return;
  const patch = afterFetch(
    {
      status: source.status,
      statusReason: source.statusReason,
      consecutiveFailures: source.consecutiveFailures,
      archivedAt: null,
    },
    "failed",
  );
  if (!patch) return;
  await repo.applySourceState(source.id, patch);
  if (patch.status === "paused")
    await repo.notifyOnce(
      {
        kind: "source_auto_paused",
        channel: "control_center",
        severity: "warn",
        objectRef: `source:${source.id}`,
        dedupeKey: `source_auto_paused:${source.id}`,
        title: `Fonte ${source.name} pausada após 3 falhas seguidas: ${message}`,
        body: `A fonte ${source.name} (${source.slug}) falhou em ${patch.consecutiveFailures ?? 3} coletas seguidas e foi pausada automaticamente. Último erro: ${message}. Retome pelo painel de fontes depois de corrigir.`,
      },
      AUTO_PAUSE_DEDUPE_SEC,
    );
}

/**
 * `onExhausted` do drain (#6): um `fetch` que a varredura moveu para a quarentena sem passar pela
 * etapa (worker caiu ou estourou a visibilidade na última tentativa) conta a falha final pelo
 * mesmo caminho, uma vez por (fonte, run). Outras etapas e fontes fora de `active`/`degraded` são
 * ignoradas.
 */
export function createExhaustedFetchHandler(deps: Pick<IngestDeps, "repo">) {
  return async (msg: PipelineMessage, error: string): Promise<void> => {
    if (msg.step !== "fetch") return;
    const source = await deps.repo.sourceBySlug(msg.itemRef.replace(/^source:/, ""));
    if (!source || (source.status !== "active" && source.status !== "degraded")) return;
    await countFinalFailure(deps.repo, source, msg.runId, error, null);
  };
}

export function createFetchStep(deps: IngestDeps): StepHandler {
  return async (msg, ctx) => (await runFetch(msg, deps, ctx)).result;
}
