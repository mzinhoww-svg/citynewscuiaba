import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createProductionAi } from "@/lib/ai/server";
import type { CallAgent } from "@/lib/ai/call-agent";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import { createIngestRepo, createFlags, createRunStore } from "@/lib/db/pipeline-store";
import type { CrawlDeps } from "@/lib/pipeline/http";
import type { Queue } from "@/lib/pipeline/ports";
import { pipelineQueue } from "@/lib/pipeline/queue";
import type { MediaStore } from "@/lib/media/store";
import { createHash } from "node:crypto";
import { crawlDeps } from "./http-deps";

/**
 * Dependências de servidor das ações do painel de fontes: service role (limites por pessoa, fila,
 * descobertas), rede (`crawlGet`/`checkRobots`), IA e fila. Produção usa os padrões; os testes de
 * integração trocam por `runWithSourceDeps` (fila com namespace, rede falsa, IA falsa).
 */
export interface SourceServerDeps {
  service?: DbClient;
  queue?: Queue;
  crawl?: CrawlDeps;
  callAgent?: CallAgent;
  mediaStore?: MediaStore;
  now?: () => Date;
}

const store = new AsyncLocalStorage<SourceServerDeps>();

export function runWithSourceDeps<T>(deps: SourceServerDeps, fn: () => Promise<T>): Promise<T> {
  return store.run(deps, fn);
}

export interface ResolvedSourceDeps {
  service: DbClient;
  queue: Queue;
  crawl: CrawlDeps;
  callAgent: CallAgent;
  mediaStore: MediaStore | undefined;
  now: () => Date;
  runs: ReturnType<typeof createRunStore>;
  ingest: ReturnType<typeof createIngestRepo>;
  flags: ReturnType<typeof createFlags>;
}

export function sourceDeps(): ResolvedSourceDeps {
  const o = store.getStore() ?? {};
  const service = o.service ?? createServiceClient();
  return {
    service,
    queue: o.queue ?? pipelineQueue(),
    crawl: o.crawl ?? crawlDeps(),
    callAgent: o.callAgent ?? createProductionAi().callAgent,
    mediaStore: o.mediaStore,
    now: o.now ?? (() => new Date()),
    runs: createRunStore(service),
    ingest: createIngestRepo(service),
    flags: createFlags(service),
  };
}

/** Hash curto e estável da pessoa para a chave de limite (o id cru não vai para `rate_limits`). */
export const personKey = (userId: string): string =>
  createHash("sha256").update(userId).digest("hex").slice(0, 32);
