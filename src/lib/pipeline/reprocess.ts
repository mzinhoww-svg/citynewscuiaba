import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import { isStepName } from "@/lib/control/monitor";
import { studioAction, StudioFailure, type StudioError } from "@/lib/studio/action";
import { pipelineQueue } from "./queue";
import type { Queue } from "./ports";
import { queueFor, STEP_NAMES, type StepName } from "./types";

/*
 * Reprocessar e "Executar agora" (P5-T3). O papel vem da sessão (`source.manage`: admin,
 * editor_chefe, operador_ia) e toda chamada audita (`pipeline.reprocess`, `pipeline.run_now`;
 * negação grava `.denied`). A fila é do servidor: depois de checar o papel, grava com service role.
 * Nada aqui publica: as etapas seguem decidindo por `decidePublication`, com as mesmas travas.
 */

export class ReprocessError extends Error {
  constructor(
    readonly code: StudioError,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ReprocessError";
  }
}

export interface ReprocessDeps {
  /** Fila (testes usam um namespace); padrão: a de produção. */
  queue?: Queue;
  /** Cliente de servidor (service role); padrão: o de produção. */
  db?: DbClient;
  now?: () => Date;
}

export interface ReprocessInput {
  scope: { runId?: string; itemIds?: string[]; sourceId?: string };
  fromStep: StepName;
  /** Padrão `true`: `decisions.human_decision` não muda e o item não volta às etapas que decidem. */
  keepHumanDecisions: boolean;
}

/** Máximo de itens por chamada: reprocessar tudo de uma vez seria um ciclo inteiro. */
export const MAX_REPROCESS_ITEMS = 1000;
/** Etapas que decidem sobre a matéria; com decisão humana e `keepHumanDecisions`, o item fica de fora. */
const DECIDING: readonly StepName[] = ["rules", "route", "publish"];
/** Etapas por matéria ou tópico: `sourceId` não alcança (não há vínculo direto com a fonte). */
const RAW_STEPS: readonly StepName[] = ["validate", "extract", "normalize"];
const ITEM_STEPS: readonly StepName[] = ["dedupe", "cluster", "classify", "locate"];

const UUID = z.string().uuid();

/** "Executar agora": 20 por hora por pessoa e 1 a cada 5 min por fonte. */
const RUN_NOW_PER_PERSON_PER_HOUR = 20;
const RUN_NOW_SOURCE_GAP_MS = 5 * 60_000;
const REF = /^(?:source|raw|item|article|topic):\S{1,380}$/;

const InputSchema = z.object({
  scope: z
    .object({
      runId: UUID.optional(),
      itemIds: z
        .array(z.string().regex(REF, "Referência de item inválida"))
        .max(MAX_REPROCESS_ITEMS)
        .optional(),
      sourceId: UUID.optional(),
    })
    .refine(
      (s) => s.runId || s.itemIds?.length || s.sourceId,
      "Informe o ciclo, os itens ou a fonte",
    ),
  fromStep: z.enum(STEP_NAMES),
  keepHumanDecisions: z.boolean(),
});

function must<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`reprocessar (${what}): ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
}

const idOf = (ref: string): string | null =>
  /^(?:raw|item|article|topic):([^#\s]+)/.exec(ref)?.[1] ?? null;

/** Referências que a etapa `fromStep` consome, dentro do escopo. */
async function resolveRefs(db: DbClient, input: ReprocessInput, now: Date): Promise<string[]> {
  const { runId, itemIds, sourceId } = input.scope;
  if (itemIds?.length) return [...new Set(itemIds)];

  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  let slug: string | null = null;
  if (sourceId) {
    const src = await db.from("sources").select("slug").eq("id", sourceId).maybeSingle();
    if (src.error) throw new Error(`reprocessar (fonte): ${src.error.message}`);
    if (!src.data) throw new StudioFailure("not_found", "Fonte não encontrada.");
    slug = src.data.slug;
    if (input.fromStep === "fetch") return [`source:${slug}`];
  }

  let ids: Set<string> | null = null;
  if (sourceId) {
    if (RAW_STEPS.includes(input.fromStep)) {
      const q = db.from("raw_items").select("id").eq("source_id", sourceId);
      const rows = must(
        "raw_items",
        await (runId ? q.eq("run_id", runId) : q.gte("fetched_at", since)).limit(5000),
      );
      ids = new Set(rows.map((r) => r.id));
    } else if (ITEM_STEPS.includes(input.fromStep)) {
      const rows = must(
        "collected_items",
        await db
          .from("collected_items")
          .select("id")
          .eq("source_id", sourceId)
          .gte("created_at", since)
          .limit(5000),
      );
      ids = new Set(rows.map((r) => r.id));
    } else {
      throw new StudioFailure(
        "invalid",
        "Esta etapa não se liga direto à fonte. Escolha o ciclo ou informe os itens.",
      );
    }
  }

  let q = db
    .from("pipeline_events")
    .select("item_ref")
    .eq("step", input.fromStep)
    .not("item_ref", "is", null);
  q = runId ? q.eq("run_id", runId) : q.gte("at", since);
  const rows = must("eventos", await q.order("id", { ascending: false }).limit(5000));
  const refs = new Set<string>();
  for (const r of rows) {
    const ref = r.item_ref;
    if (!ref || !REF.test(ref)) continue;
    if (ids) {
      const id = idOf(ref);
      if (!id || !ids.has(id)) continue;
    }
    refs.add(ref);
  }
  return [...refs];
}

async function messageRunId(db: DbClient, input: ReprocessInput, refs: string[]): Promise<string> {
  if (input.scope.runId) return input.scope.runId;
  const first = refs[0];
  if (first) {
    const ev = await db
      .from("pipeline_events")
      .select("run_id")
      .eq("item_ref", first)
      .not("run_id", "is", null)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ev.data?.run_id) return ev.data.run_id;
  }
  const last = await db
    .from("ingest_runs")
    .select("id")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) throw new Error(`reprocessar (ciclo): ${last.error.message}`);
  if (!last.data)
    throw new StudioFailure("invalid", "Não há ciclo para vincular o reprocessamento.");
  return last.data.id;
}

async function inChunks<T>(items: readonly T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

const reprocessAction = (deps: ReprocessDeps) =>
  studioAction<ReprocessInput, { enqueued: number }>(
    "source.manage",
    () => ({}),
    async (raw, ctx) => {
      const input = raw;
      const db = deps.db ?? createServiceClient();
      const queue = deps.queue ?? pipelineQueue();
      const now = (deps.now ?? (() => new Date()))();

      let refs = await resolveRefs(db, input, now);
      if (refs.length > MAX_REPROCESS_ITEMS)
        throw new StudioFailure(
          "invalid",
          `Escopo grande demais (máximo ${MAX_REPROCESS_ITEMS} itens).`,
        );

      // Decisões humanas por matéria (`article:<id>`, sem o sufixo `#tipo` das notificações).
      const articleRefs = [
        ...new Set(refs.flatMap((r) => (r.startsWith("article:") ? [r.split("#")[0]!] : []))),
      ];
      let humanRefs: string[] = [];
      if (articleRefs.length) {
        const rows = must(
          "decisões",
          await db
            .from("decisions")
            .select("object_ref")
            .in("object_ref", articleRefs)
            .not("human_decision", "is", null),
        );
        humanRefs = [...new Set(rows.map((r) => r.object_ref))];
      }
      let skippedHuman = 0;
      let clearedHuman = 0;
      if (input.keepHumanDecisions) {
        if (DECIDING.includes(input.fromStep) && humanRefs.length) {
          const keep = new Set(humanRefs);
          const before = refs.length;
          refs = refs.filter((r) => !keep.has(r.split("#")[0]!));
          skippedHuman = before - refs.length;
        }
      } else if (humanRefs.length) {
        const { data, error } = await db
          .from("decisions")
          .update({ human_decision: null, human_id: null })
          .in("object_ref", humanRefs)
          .not("human_decision", "is", null)
          .select("id");
        if (error) throw new Error(`reprocessar (decisões humanas): ${error.message}`);
        clearedHuman = data?.length ?? 0;
      }

      const runId = await messageRunId(db, input, refs);
      let enqueued = 0;
      await inChunks(refs, 20, async (itemRef) => {
        const added = await queue.enqueue(queueFor(input.fromStep), {
          runId,
          step: input.fromStep,
          itemRef,
          attempt: 1,
        });
        if (added) enqueued++;
      });

      // Item que estava na quarentena sai da lista de falhas ao voltar para a fila.
      if (refs.length) {
        await db
          .from("pipeline_quarantine")
          .update({ resolved_at: now.toISOString(), resolved_by: ctx.userId })
          .is("resolved_at", null)
          .eq("message->>step", input.fromStep)
          .in("message->>itemRef", refs);
      }

      ctx.detail({
        scope: { ...input.scope, itemIds: input.scope.itemIds?.slice(0, 20) },
        fromStep: input.fromStep,
        keepHumanDecisions: input.keepHumanDecisions,
        matched: refs.length + skippedHuman,
        enqueued,
        skippedHuman,
        clearedHuman,
        ...(clearedHuman ? { clearedRefs: humanRefs.slice(0, 50) } : {}),
      });
      return { enqueued };
    },
    {
      auditAs: "pipeline.reprocess",
      objectRef: (i) =>
        i.scope.runId
          ? `run:${i.scope.runId}`
          : i.scope.sourceId
            ? `source:${i.scope.sourceId}`
            : "items",
    },
  );

/**
 * Volta itens para a fila a partir de `fromStep`. `keepHumanDecisions` (padrão da tela) preserva
 * a decisão humana; desligado, ela é descartada e o registro fica na auditoria.
 */
export async function reprocess(
  input: ReprocessInput,
  deps: ReprocessDeps = {},
): Promise<{ enqueued: number }> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success)
    throw new ReprocessError("invalid", parsed.error.issues[0]?.message ?? "Entrada inválida");
  if (!isStepName(parsed.data.fromStep)) throw new ReprocessError("invalid", "Etapa inválida");
  const r = await reprocessAction(deps)(parsed.data);
  if (!r.ok) throw new ReprocessError(r.error, r.message);
  return r.value;
}

export interface RunNowResult {
  runId: string;
  windowStart: string;
  /** Coletas (`fetch`) que entraram na fila; 0 quando já estavam pendentes. */
  enqueued: number;
}

const runNowAction = (deps: ReprocessDeps) =>
  studioAction<{ sourceId?: string }, RunNowResult>(
    "source.manage",
    () => ({}),
    async (input, ctx) => {
      const db = deps.db ?? createServiceClient();
      const queue = deps.queue ?? pipelineQueue();
      const now = (deps.now ?? (() => new Date()))();

      let sources: { slug: string }[];
      if (input.sourceId) {
        const r = await db
          .from("sources")
          .select("slug, status")
          .eq("id", input.sourceId)
          .maybeSingle();
        if (r.error) throw new Error(`executar agora (fonte): ${r.error.message}`);
        if (!r.data) throw new StudioFailure("not_found", "Fonte não encontrada.");
        if (r.data.status === "blocked")
          throw new StudioFailure("invalid", "Fonte bloqueada: retome antes de coletar.");
        sources = [r.data];
      } else {
        sources = must(
          "fontes",
          await db
            .from("sources")
            .select("slug")
            .in("status", ["active", "degraded"])
            .order("slug"),
        );
      }

      // Cota: 20/h por pessoa e, numa fonte só, 1 a cada 5 min (como "Coletar agora").
      const person = createHash("sha256").update(ctx.userId).digest("hex").slice(0, 32);
      const gate = await db.rpc("hit_rate_limit", {
        p_bucket: "run_now",
        p_key_hash: person,
        p_limit: RUN_NOW_PER_PERSON_PER_HOUR,
        p_window_seconds: 3600,
      });
      if (gate.error) throw new Error(`executar agora (limite): ${gate.error.message}`);
      if (gate.data !== true)
        throw new StudioFailure("invalid", "Limite de execuções por hora atingido; tente depois.");
      if (input.sourceId) {
        const last = await db
          .from("ingest_runs")
          .select("started_at")
          .eq("trigger", "manual")
          .eq("stats->>source", input.sourceId)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (last.error) throw new Error(`executar agora (fonte): ${last.error.message}`);
        if (last.data && now.getTime() - Date.parse(last.data.started_at) < RUN_NOW_SOURCE_GAP_MS)
          throw new StudioFailure("invalid", "Esta fonte foi executada há menos de 5 minutos.");
      }

      // window_start próprio (milissegundo do clique): nunca colide com a janela de 30 min do tick.
      let at = now.getTime();
      if (at % (30 * 60_000) === 0) at += 1;
      let run: { id: string; window_start: string } | null = null;
      for (let attempt = 0; attempt < 8 && !run; attempt++, at++) {
        const ins = await db
          .from("ingest_runs")
          .insert({
            window_start: new Date(at).toISOString(),
            // `manual`: o fetch não passa pela trava de janela e o watchdog não conta o run.
            trigger: "manual",
            stats: {
              manual: true,
              ...(input.sourceId ? { source: input.sourceId } : {}),
              requested_by: ctx.userId,
              ...(input.sourceId ? { source_id: input.sourceId } : {}),
            },
          })
          .select("id, window_start")
          .single();
        if (!ins.error) run = ins.data;
        else if (ins.error.code !== "23505")
          throw new Error(`executar agora (ciclo): ${ins.error.message}`);
      }
      if (!run) throw new Error("executar agora: não foi possível reservar o ciclo");
      ctx.setObjectRef(`run:${run.id}`);

      let enqueued = 0;
      await inChunks(sources, 20, async (s) => {
        const added = await queue.enqueue("pipeline", {
          runId: run.id,
          step: "fetch",
          itemRef: `source:${s.slug}`,
          attempt: 1,
        });
        if (added) enqueued++;
      });
      const upd = await db
        .from("ingest_runs")
        .update({
          stats: {
            manual: true,
            requested_by: ctx.userId,
            fetch_enqueued: enqueued,
            ...(input.sourceId ? { source: input.sourceId } : {}),
            ...(input.sourceId ? { source_id: input.sourceId } : {}),
          },
        })
        .eq("id", run.id);
      if (upd.error) throw new Error(`executar agora (estatísticas): ${upd.error.message}`);

      ctx.detail({ sourceId: input.sourceId ?? null, sources: sources.length, enqueued });
      return { runId: run.id, windowStart: new Date(run.window_start).toISOString(), enqueued };
    },
    { auditAs: "pipeline.run_now", objectRef: () => "run:new" },
  );

/** "Executar agora": ciclo manual fora da janela de 30 min, para todas as fontes ou uma. */
export async function runNow(
  input: { sourceId?: string } = {},
  deps: ReprocessDeps = {},
): Promise<RunNowResult> {
  const parsed = z.object({ sourceId: UUID.optional() }).safeParse(input);
  if (!parsed.success) throw new ReprocessError("invalid", "Fonte inválida");
  const r = await runNowAction(deps)(parsed.data);
  if (!r.ok) throw new ReprocessError(r.error, r.message);
  return r.value;
}
