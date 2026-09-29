// Limpeza das suítes de integração (revisão P3-GATE, BAIXA 11): cada suíte registra o que cria
// (runs, namespaces de fila, itens, prefixos de item_ref e limites de uso) e apaga no afterAll,
// para `pnpm test` seguido de `pnpm test:e2e` enxergar só o seed.
// O `audit_log` é somente inserção por desenho (0001) e fica de fora.
import type { DbClient } from "@/lib/db/client";

export interface PipelineTrash {
  runIds: Set<string>;
  namespaces: Set<string>;
  itemIds: Set<string>;
  /** Padrões LIKE de `pipeline_events.item_ref` (eventos sem run). */
  itemRefLike: Set<string>;
  /** Linhas de `rate_limits` criadas pelo robô nos testes. */
  rateLimits: { bucket: string; keyHash: string }[];
  /** Estado da coleta das fontes antes da suíte (restaurado no fim). */
  sources: SourceState[];
}

type SourceState = {
  slug: string;
  status: "active" | "paused" | "degraded" | "blocked";
  etag: string | null;
  last_modified: string | null;
  last_error: string | null;
  last_fetched_at: string | null;
  /** Trava da coleta (`claim_source_fetch`): sem restaurar, a reexecução da suíte não coleta. */
  last_fetch_started_at: string | null;
  last_fetch_run_id: string | null;
};

/** Guarda o estado de coleta das fontes que a suíte vai buscar. */
export async function rememberSources(db: DbClient, t: PipelineTrash, slugs: readonly string[]) {
  const { data, error } = await db
    .from("sources")
    .select(
      "slug, status, etag, last_modified, last_error, last_fetched_at, last_fetch_started_at, last_fetch_run_id",
    )
    .in("slug", [...slugs]);
  check("sources", error);
  t.sources.push(...(data ?? []));
}

export function pipelineTrash(): PipelineTrash {
  return {
    runIds: new Set(),
    namespaces: new Set(),
    itemIds: new Set(),
    itemRefLike: new Set(),
    rateLimits: [],
    sources: [],
  };
}

function check(what: string, error: { message: string } | null) {
  if (error) throw new Error(`limpeza (${what}): ${error.message}`);
}

/** Apaga tudo o que a suíte registrou, na ordem das chaves estrangeiras. */
export async function purgePipeline(db: DbClient, t: PipelineTrash): Promise<void> {
  for (const ns of t.namespaces) {
    check("jobs", (await db.from("jobs").delete().like("queue", `${ns}:%`)).error);
    check(
      "pipeline_quarantine",
      (await db.from("pipeline_quarantine").delete().like("queue", `${ns}:%`)).error,
    );
  }

  const runIds = [...t.runIds];
  const raws = runIds.length
    ? ((await db.from("raw_items").select("id").in("run_id", runIds)).data ?? []).map((r) => r.id)
    : [];
  const fromRaws = raws.length
    ? ((await db.from("collected_items").select("id").in("raw_id", raws)).data ?? []).map(
        (r) => r.id,
      )
    : [];
  const items = [...new Set([...t.itemIds, ...fromRaws])];
  if (items.length) {
    check(
      "decisions",
      (
        await db
          .from("decisions")
          .delete()
          .in(
            "object_ref",
            items.map((i) => `item:${i}`),
          )
      ).error,
    );
    check(
      "article_sources",
      (await db.from("article_sources").delete().in("item_id", items)).error,
    );
    check(
      "collected_items(duplicate_of)",
      (await db.from("collected_items").update({ duplicate_of: null }).in("id", items)).error,
    );
    check("collected_items", (await db.from("collected_items").delete().in("id", items)).error);
  }

  if (runIds.length || t.itemRefLike.size) {
    const { error } = await db.rpc("purge_pipeline_events", {
      p_run_ids: runIds.length ? runIds : undefined,
      p_item_refs: t.itemRefLike.size ? [...t.itemRefLike] : undefined,
    });
    check("pipeline_events", error);
  }
  if (raws.length) check("raw_items", (await db.from("raw_items").delete().in("id", raws)).error);
  if (runIds.length)
    check("ingest_runs", (await db.from("ingest_runs").delete().in("id", runIds)).error);
  for (const { slug, ...state } of t.sources)
    check("sources", (await db.from("sources").update(state).eq("slug", slug)).error);
  for (const r of t.rateLimits)
    check(
      "rate_limits",
      (await db.from("rate_limits").delete().eq("bucket", r.bucket).eq("key_hash", r.keyHash))
        .error,
    );
}
