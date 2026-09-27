import { err, ok } from "@/lib/result";
import { checkRobots, crawlGet, type CrawlDeps } from "../http";
import type { IngestRepo, SourceRecord } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";

export interface IngestDeps extends CrawlDeps {
  repo: IngestRepo;
  now: () => Date;
}

export const RATE_LIMITED = "limite de requisições por hora da fonte atingido; coleta adiada";

/** URL coletada: o feed descoberto, ou a página inicial para fontes do tipo `page`. */
export function collectUrl(source: SourceRecord): string | null {
  return source.feedUrl ?? (source.kind === "page" ? source.baseUrl : null);
}

/**
 * Etapa 2: baixa o documento da fonte (um `raw_items` por fonte e run). Respeita status,
 * `robots.txt`, limite por hora e coleta condicional; 304 encerra sem item novo.
 */
export function createFetchStep(deps: IngestDeps): StepHandler {
  return async (msg) => {
    const slug = msg.itemRef.replace(/^source:/, "");
    const source = await deps.repo.sourceBySlug(slug);
    if (!source) return err(stepError.notFound(`fonte ${slug} não encontrada`));
    if (source.status !== "active") return ok([]);

    const url = collectUrl(source);
    if (!url) {
      const reason = "fonte sem feed descoberto: rode activateSource";
      await deps.repo.updateSource(source.id, { lastError: reason });
      return err(stepError.invalid(reason));
    }
    const limits = { bucket: `crawler:${source.slug}`, limitPerHour: source.rateLimitPerHour };

    const robots = await checkRobots(deps, url, limits);
    if (robots.kind === "unavailable") return err(stepError.transient(robots.reason));
    if (robots.kind === "rate_limited" || robots.kind === "disallowed") {
      await deps.repo.updateSource(source.id, {
        lastError: robots.kind === "rate_limited" ? RATE_LIMITED : robots.reason,
      });
      return ok([]);
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
        return ok([]);
      case "not_modified":
        await deps.repo.updateSource(source.id, { lastFetchedAt: fetchedAt, lastError: null });
        return ok([]);
      case "network_error":
        return err(stepError.transient(res.message));
      case "too_large":
        await deps.repo.updateSource(source.id, { lastError: "documento maior que 5 MB" });
        return err(stepError.invalid("documento maior que 5 MB"));
      case "http_error": {
        const reason = `HTTP ${res.status} em ${url}`;
        if (res.status === 429 || res.status >= 500) return err(stepError.transient(reason));
        await deps.repo.updateSource(source.id, { lastError: reason });
        return err(stepError.invalid(reason));
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
        return ok([nextMessage(msg, "validate", `raw:${rawId}`)]);
      }
    }
  };
}
