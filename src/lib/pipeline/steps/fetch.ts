import { err, ok } from "@/lib/result";
import { afterFetch } from "@/lib/sources/status";
import { checkRobots, crawlGet, type CrawlDeps } from "../http";
import type { IngestRepo, SourceRecord } from "../ports";
import { MAX_ATTEMPTS } from "../retry";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { fastWindowStart } from "../window";

export interface IngestDeps extends CrawlDeps {
  repo: IngestRepo;
  now: () => Date;
  /** Relógio em ms para medir a latência da coleta (padrão `Date.now`). */
  nowMs?: () => number;
}

export const RATE_LIMITED = "limite de requisições por hora da fonte atingido; coleta adiada";

/** Janela de dedupe da notificação de pausa automática (1 h). */
const PAUSE_NOTICE_WINDOW_SEC = 3600;

/** URL coletada: o feed descoberto, ou a página inicial para fontes do tipo `page`. */
export function collectUrl(source: SourceRecord): string | null {
  return source.feedUrl ?? (source.kind === "page" ? source.baseUrl : null);
}

/** `source:<slug>` ou `source:<slug>:manual:<runId>` (coleta manual) → slug. */
export function slugOfFetchRef(itemRef: string): string {
  return itemRef.replace(/^source:/, "").split(":")[0] ?? "";
}

/**
 * Etapa 2: baixa o documento da fonte (um `raw_items` por fonte e run). Respeita status
 * (`active` e `degraded`), `robots.txt`, limite por hora e coleta condicional; 304 encerra sem
 * item novo. Runs `cron` e `fast` só requisitam depois de `claim_source_fetch` (uma coleta por
 * janela de 10 min, D-F29); runs `manual` não passam pela trava. O resultado final da coleta
 * (não a tentativa) alimenta a saúde e a pausa automática (D-F18).
 */
export function createFetchStep(deps: IngestDeps): StepHandler {
  const clock = deps.nowMs ?? (() => Date.now());
  return async (msg, ctx) => {
    const slug = slugOfFetchRef(msg.itemRef);
    const source = await deps.repo.sourceBySlug(slug);
    if (!source) return err(stepError.notFound(`fonte ${slug} não encontrada`));
    if (source.status !== "active" && source.status !== "degraded") return ok([]);

    if ((await deps.repo.runTrigger(msg.runId)) !== "manual") {
      const claimed = await deps.repo.claimFetch(source.id, msg.runId, fastWindowStart(deps.now()));
      // Outro run já coletou a fonte nesta janela: sem requisição, sem `raw_items`, sem falha.
      if (!claimed) return ok([]);
    }

    const startedAt = clock();
    const finalAttempt = msg.attempt >= MAX_ATTEMPTS;

    /** Registra o resultado final: saúde do dia, estado da fonte e aviso de pausa automática. */
    const settle = async (outcome: "ok" | "not_modified" | "failed", error: string | null) => {
      await deps.repo.recordFetch(
        source.id,
        outcome,
        Math.max(0, Math.round(clock() - startedAt)),
        0,
        error,
      );
      const patch = afterFetch(
        {
          status: source.status,
          statusReason: source.statusReason ?? null,
          consecutiveFailures: source.consecutiveFailures ?? 0,
          archivedAt: null,
        },
        outcome,
      );
      if (!patch) return;
      await deps.repo.applySourceState(source.id, patch);
      if (patch.status === "paused" && patch.statusReason === "auto_failures") {
        await deps.repo.notifyOnce(
          {
            kind: "source_auto_paused",
            channel: "control_center",
            severity: "warn",
            objectRef: `source:${source.slug}`,
            dedupeKey: `source-auto-paused:${source.slug}`,
            title: `Fonte ${source.name} pausada após 3 falhas seguidas`,
            body: `Fonte ${source.name} pausada após 3 falhas seguidas: ${error ?? "sem detalhe"}`,
          },
          PAUSE_NOTICE_WINDOW_SEC,
        );
      }
    };

    /** Falha não recuperável: conta na hora (sem retry). */
    const failed = async (reason: string) => {
      await deps.repo.updateSource(source.id, { lastError: reason });
      await settle("failed", reason);
      return err(stepError.invalid(reason));
    };
    /** Falha transitória: só a última tentativa do run conta. */
    const transient = async (reason: string) => {
      if (finalAttempt) {
        await deps.repo.updateSource(source.id, { lastError: reason });
        await settle("failed", reason);
      }
      return err(stepError.transient(reason));
    };

    const url = collectUrl(source);
    if (!url) return failed("fonte sem feed descoberto: rode activateSource");
    const limits = {
      bucket: `crawler:${source.slug}`,
      limitPerHour: source.rateLimitPerHour,
      signal: ctx?.signal,
    };

    const robots = await checkRobots(deps, url, limits);
    if (robots.kind === "unavailable") return transient(robots.reason);
    if (robots.kind === "rate_limited") {
      await deps.repo.updateSource(source.id, { lastError: RATE_LIMITED });
      return ok([]);
    }
    if (robots.kind === "disallowed") {
      await deps.repo.updateSource(source.id, { lastError: robots.reason });
      await settle("failed", robots.reason);
      return ok([]);
    }

    // ETag e Last-Modified valem sempre (também na via rápida): 304 é sucesso barato.
    const res = await crawlGet(deps, url, {
      ...limits,
      etag: source.etag,
      lastModified: source.lastModified,
    });
    const fetchedAt = deps.now().toISOString();
    switch (res.kind) {
      case "rate_limited":
        await deps.repo.updateSource(source.id, { lastError: RATE_LIMITED });
        return ok([]);
      case "not_modified":
        await deps.repo.updateSource(source.id, { lastFetchedAt: fetchedAt, lastError: null });
        await settle("not_modified", null);
        return ok([]);
      case "network_error":
        return transient(res.message);
      case "too_large":
        return failed("documento maior que 5 MB");
      case "http_error": {
        const reason = `HTTP ${res.status} em ${url}`;
        if (res.status === 429 || res.status >= 500) return transient(reason);
        return failed(reason);
      }
      case "ok": {
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
        await settle("ok", null);
        return ok([nextMessage(msg, "validate", `raw:${rawId}`)]);
      }
    }
  };
}
