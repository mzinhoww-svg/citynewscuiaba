import "server-only";
import { createIngestRepo } from "@/lib/db/pipeline-store";
import { crawlDeps } from "@/lib/sources/http-deps";
import { discoverSourceLogo } from "@/lib/sources/logo-fetch";
import { syncSourceLogos, type SyncOptions, type SyncReport } from "@/lib/sources/logo-sync";
import { createServiceClient, type DbClient } from "./client";
import { createSourceLogoStore } from "./source-logo-store";

/** Última tentativa de qualquer fonte (a rota usa para o intervalo mínimo entre chamadas). */
export async function lastLogoCheckAt(db: DbClient): Promise<Date | null> {
  const { data } = await db
    .from("source_logo_checks")
    .select("checked_at")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.checked_at ? new Date(data.checked_at) : null;
}

/**
 * Roda a rotina de logotipos no servidor: busca na internet, grava no Storage e atualiza
 * `logo_path`, `logo_source` e `logo_origin_url`. Com `CRAWLER_FIXTURES=1` (fora de produção) usa
 * as fixtures fictícias, sem rede.
 */
export async function runSourceLogoSync(
  opts: SyncOptions & { db?: DbClient; signal?: AbortSignal } = {},
): Promise<SyncReport> {
  const db = opts.db ?? createServiceClient();
  const deps = crawlDeps({ repo: createIngestRepo(db) });
  const net = { http: deps.http, resolve: deps.resolve, userAgent: deps.userAgent };
  return syncSourceLogos(
    {
      store: createSourceLogoStore(db),
      discover: (baseUrl) => discoverSourceLogo(net, baseUrl, { signal: opts.signal }),
      now: () => new Date(),
    },
    opts,
  );
}
