import "server-only";
import { randomUUID } from "node:crypto";
import type { Json } from "@/lib/db/types";
import { err, ok, type Result } from "@/lib/result";
import {
  FAST_FREQUENCIES,
  type ConsumptionStrategy,
  type Locality,
  type SourceConfig,
  type SourceLayer,
} from "@/lib/sources";
import { logoObjectPath } from "@/lib/sources/logo-path";
import type { DbClient } from "./client";

/**
 * Escrita do painel de fontes (spec §6.4, §7): tudo pelas RPCs `security invoker` de 0011 com a
 * sessão da pessoa (RLS, `guard_source_changes` e `audit_source_changes` valem). O contexto de
 * auditoria (`reason`, `batchId`, `approvalId`) vai em `p_ctx` e o hash do IP em `p_ip_hash`.
 * O patch de `source_admin_update` é só snake_case: este módulo converte o camelCase de
 * `SourceConfig`. Erros do banco viram códigos tipados (nunca texto do Postgres na tela).
 */

export interface AuditCtx {
  reason?: string | null;
  batchId?: string | null;
  approvalId?: string | null;
  ipHash?: string | null;
}

export type StoreError =
  | "conflict"
  | "forbidden"
  | "invalid"
  | "not_found"
  | "fast_lane_full"
  | "fast_lane_inactive"
  | "invalid_transition"
  | "needs_approval"
  | "duplicate"
  | "unavailable";

export type StatusAction =
  "activate" | "pause" | "resume" | "block" | "unblock" | "archive" | "restore";

export type BulkAction = "pause" | "activate" | "frequency";

export interface BulkItemResult {
  id: string;
  name: string | null;
  outcome: "done" | "ignored" | "failed";
  /** Motivo em código (`already_paused`, `fast_lane_full`…); a tela traduz. */
  reason: BulkReason | null;
}

export type BulkReason =
  | "already_paused"
  | "not_active"
  | "not_paused"
  | "not_activated"
  | "blocked"
  | "archived"
  | "fast_lane_full"
  | "not_found"
  | "failed";

/** Campos editáveis (camelCase). `slug` e `baseUrl` são a identidade da fonte: não mudam. */
export type SourcePatch = Partial<
  Omit<SourceConfig, "slug" | "baseUrl" | "strategy" | "pageSelectors" | "feedUrl">
> & {
  logoPath?: string | null;
  ownerId?: string | null;
  termsReviewedAt?: string | null;
  termsReviewedBy?: string | null;
  kind?: SourceKindDb;
  feedUrl?: string | null;
  consumption?: Record<string, unknown>;
};

export type SourceKindDb = "rss" | "sitemap" | "api" | "page";

export interface SourceCreateInput {
  slug: string;
  name: string;
  displayName?: string | null;
  baseUrl: string;
  kind: SourceKindDb;
  feedUrl: string | null;
  categories: string[];
  locality: Locality;
  layer: SourceLayer | null;
  frequencyMinutes: number | null;
  rateLimitPerHour: number;
  priority: 1 | 2 | 3;
  editorialScore: number;
  consumption: Record<string, unknown>;
  ownerId?: string | null;
  agreementUntil?: string | null;
  agreementNote?: string | null;
  termsUrl?: string | null;
}

/** Estratégia de consumo → `sources.kind` que o pipeline executa (spec §6.2). */
export function kindForStrategy(strategy: ConsumptionStrategy): SourceKindDb {
  switch (strategy) {
    case "rss":
    case "atom":
      return "rss";
    case "jsonfeed":
      return "api";
    case "sitemap_news":
      return "sitemap";
    case "page_list":
    case "page_article":
      return "page";
  }
}

const COLUMN: Record<string, string> = {
  name: "name",
  displayName: "display_name",
  layer: "layer",
  categories: "categories",
  locality: "locality",
  reliability: "reliability",
  imagePolicy: "image_policy",
  republishPolicy: "republish_policy",
  maySoleSource: "may_be_sole_source",
  agreementUntil: "agreement_until",
  agreementNote: "agreement_note",
  termsUrl: "terms_url",
  frequencyMinutes: "frequency_minutes",
  rateLimitPerHour: "rate_limit_per_hour",
  termsMinIntervalMinutes: "terms_min_interval_minutes",
  editorialScore: "editorial_score",
  priority: "priority",
  recPinned: "rec_pinned",
  recLocalHighlight: "rec_local_highlight",
  recExcluded: "rec_excluded",
  trusted: "trusted",
  logoPath: "logo_path",
  ownerId: "owner_id",
  termsReviewedAt: "terms_reviewed_at",
  termsReviewedBy: "terms_reviewed_by",
  kind: "kind",
  feedUrl: "feed_url",
  consumption: "consumption",
};

/** camelCase → snake_case do contrato de `source_admin_update`; campo sem coluna é descartado. */
export function toDbPatch(patch: SourcePatch): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = COLUMN[key];
    if (!column || value === undefined) continue;
    out[column] = value as Json;
  }
  return out;
}

/** Nome da coluna crítica (snake) → chave de `SourcePatch`, para aplicar uma aprovação. */
export const CRITICAL_COLUMN_TO_KEY: Record<string, keyof SourcePatch> = {
  image_policy: "imagePolicy",
  republish_policy: "republishPolicy",
  reliability: "reliability",
  may_be_sole_source: "maySoleSource",
};

type DbError = { code?: string; message: string; hint?: string | null };

/** Traduz o erro do PostgREST/Postgres (0011) num código estável. */
export function mapDbError(e: DbError): StoreError {
  const m = e.message ?? "";
  if (e.code === "PT409" || /conflito de versão/.test(m)) return "conflict";
  if (/via rápida está cheia/.test(m)) return "fast_lane_full";
  if (/antes de colocá-la na via rápida|nascer na via rápida/.test(m)) return "fast_lane_inactive";
  if (/sem permissão/.test(m)) return "forbidden";
  if (
    /exige aprovação de outra pessoa|direitos restritos/.test(m) ||
    /duas pessoas/i.test(e.hint ?? "")
  )
    return "needs_approval";
  if (e.code === "P0002" || /não encontrada/.test(m)) return "not_found";
  if (e.code === "23505") return "duplicate";
  if (
    /transição de status|só uma fonte|Arquivar exige|não está arquivada|arquivada só aceita|arquivada não pode|Ativar exige termos/.test(
      m,
    )
  )
    return "invalid_transition";
  if (e.code === "42501") return "forbidden";
  if (
    e.code === "23514" ||
    e.code === "22023" ||
    e.code === "22P02" ||
    e.code === "23502" ||
    /check|inválid|desconhecid/.test(m)
  )
    return "invalid";
  return "unavailable";
}

function ctxJson(ctx: AuditCtx): Json {
  const out: Record<string, string> = {};
  if (ctx.reason) out.reason = ctx.reason;
  if (ctx.batchId) out.batchId = ctx.batchId;
  if (ctx.approvalId) out.approvalId = ctx.approvalId;
  return out;
}

const isFast = (m: number | null | undefined): boolean => m != null && m < 30;
const FAST_SET = new Set<number>(FAST_FREQUENCIES);

interface BulkRow {
  id: string;
  name: string;
  status: "active" | "paused" | "degraded" | "blocked";
  archived_at: string | null;
  frequency_minutes: number | null;
  feed_url: string | null;
  kind: string;
  terms_reviewed_at: string | null;
  status_reason: string | null;
}

/**
 * Elegibilidade do lote (spec §7.6), fonte a fonte na ordem pedida. Frequência rápida (10/15/20)
 * enche as vagas livres e ignora o resto com motivo; trocar entre 10, 15 e 20 não ocupa vaga.
 */
export function planBulk(
  ids: string[],
  rows: BulkRow[],
  action: BulkAction,
  value: { frequencyMinutes?: number | null },
  fastLane: { max: number; used: number },
): { eligible: string[]; results: Map<string, BulkItemResult> } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const results = new Map<string, BulkItemResult>();
  const eligible: string[] = [];
  let free = Math.max(0, fastLane.max - fastLane.used);
  const target = value.frequencyMinutes ?? null;
  const ignore = (id: string, name: string | null, reason: BulkReason) =>
    results.set(id, { id, name, outcome: "ignored", reason });

  for (const id of ids) {
    const r = byId.get(id);
    if (!r) {
      ignore(id, null, "not_found");
      continue;
    }
    if (r.archived_at) {
      ignore(id, r.name, "archived");
      continue;
    }
    if (action === "pause") {
      if (r.status === "paused") ignore(id, r.name, "already_paused");
      else if (r.status === "blocked") ignore(id, r.name, "blocked");
      else eligible.push(id);
    } else if (action === "activate") {
      if (r.status === "blocked") ignore(id, r.name, "blocked");
      else if (r.status !== "paused") ignore(id, r.name, "not_paused");
      // Já passou por ativação = feed, termos revisados e nunca `pending_activation` (a ativação
      // única roda robots, teste de conexão e Crawl-delay; o lote não repete isso, FS-T9).
      else if (
        (!r.feed_url && r.kind !== "page") ||
        !r.terms_reviewed_at ||
        r.status_reason === "pending_activation"
      )
        ignore(id, r.name, "not_activated");
      else eligible.push(id);
    } else {
      if (target !== null && FAST_SET.has(target) && !isFast(r.frequency_minutes)) {
        if (r.status !== "active" && r.status !== "degraded") {
          ignore(id, r.name, "not_active");
          continue;
        }
        if (free <= 0) {
          ignore(id, r.name, "fast_lane_full");
          continue;
        }
        free--;
      }
      eligible.push(id);
    }
  }
  return { eligible, results };
}

export interface FastLaneState {
  max: number;
  used: number;
  /** Na via rápida, mas sem coletar (pausadas ou bloqueadas): ocupam vaga assim mesmo. */
  paused: number;
}

export function createSourceAdminStore(db: DbClient, opts: { storage?: () => DbClient } = {}) {
  const setting = async (key: string, fallback: number): Promise<number> => {
    const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
    const v = data?.value;
    return typeof v === "number" ? v : fallback;
  };

  const store = {
    async create(
      input: SourceCreateInput,
      ctx: AuditCtx,
    ): Promise<Result<{ id: string }, StoreError>> {
      const { data, error } = await db.rpc("source_admin_create", {
        p: {
          slug: input.slug,
          name: input.name,
          displayName: input.displayName ?? null,
          baseUrl: input.baseUrl,
          kind: input.kind,
          feedUrl: input.feedUrl,
          categories: input.categories,
          locality: input.locality,
          layer: input.layer,
          frequencyMinutes: input.frequencyMinutes,
          rateLimitPerHour: input.rateLimitPerHour,
          priority: input.priority,
          editorialScore: input.editorialScore,
          consumption: input.consumption as Json,
          ownerId: input.ownerId ?? null,
          agreementUntil: input.agreementUntil ?? null,
          agreementNote: input.agreementNote ?? null,
          termsUrl: input.termsUrl ?? null,
        },
        p_ctx: ctxJson(ctx),
        p_ip_hash: ctx.ipHash ?? undefined,
      });
      if (error) return err(mapDbError(error));
      return ok({ id: data });
    },

    async update(
      id: string,
      version: number,
      patch: SourcePatch,
      ctx: AuditCtx,
    ): Promise<Result<{ version: number }, StoreError>> {
      const dbPatch = toDbPatch(patch);
      if (Object.keys(dbPatch).length === 0) return ok({ version });
      const { data, error } = await db.rpc("source_admin_update", {
        p_id: id,
        p_version: version,
        p_patch: dbPatch,
        p_ctx: ctxJson(ctx),
        p_ip_hash: ctx.ipHash ?? undefined,
      });
      if (error) return err(mapDbError(error));
      return ok({ version: data });
    },

    async setStatus(
      id: string,
      version: number,
      action: StatusAction,
      reason: string | null,
      ctx: AuditCtx,
    ): Promise<Result<{ version: number }, StoreError>> {
      const { data, error } = await db.rpc("source_admin_status", {
        p_id: id,
        p_version: version,
        p_action: action,
        p_reason: reason ?? undefined,
        p_ctx: ctxJson({ ...ctx, reason: ctx.reason ?? reason }),
        p_ip_hash: ctx.ipHash ?? undefined,
      });
      if (error) return err(mapDbError(error));
      return ok({ version: data });
    },

    async bulk(
      ids: string[],
      action: BulkAction,
      value: { frequencyMinutes?: number | null },
      ctx: AuditCtx,
    ): Promise<Result<{ items: BulkItemResult[]; batchId: string | null }, StoreError>> {
      const { data: rows, error: readError } = await db
        .from("sources")
        .select(
          "id, name, status, archived_at, frequency_minutes, feed_url, kind, terms_reviewed_at, status_reason",
        )
        .in("id", ids);
      if (readError) return err(mapDbError(readError));
      const lane = await store.fastLane();
      const { eligible, results } = planBulk(ids, rows ?? [], action, value, lane);

      // O id do lote é escolhido aqui e gravado pelo banco em toda linha de auditoria (0032):
      // nada de ler a auditoria de volta, que corria contra lotes simultâneos (achado 7).
      let batchId: string | null = null;
      if (eligible.length > 0) {
        batchId = randomUUID();
        const { data, error } = await db.rpc("source_admin_bulk", {
          p_batch_id: batchId,
          p_ids: eligible,
          p_action: action,
          p_value: { frequencyMinutes: value.frequencyMinutes ?? null },
          p_ctx: ctxJson(ctx),
          p_ip_hash: ctx.ipHash ?? undefined,
        });
        if (error) return err(mapDbError(error));
        const names = new Map((rows ?? []).map((r) => [r.id, r.name]));
        for (const item of (Array.isArray(data) ? data : []) as {
          id: string;
          ok: boolean;
          reason?: string;
        }[]) {
          results.set(item.id, {
            id: item.id,
            name: names.get(item.id) ?? null,
            outcome: item.ok ? "done" : "failed",
            reason: item.ok ? null : bulkReason(item.reason ?? ""),
          });
        }
      }
      return ok({
        items: ids.map(
          (id) => results.get(id) ?? { id, name: null, outcome: "failed", reason: "failed" },
        ),
        batchId,
      });
    },

    defaultFrequency: () => setting("sources.default_frequency_minutes", 30),

    async setDefaultFrequency(minutes: number, ctx: AuditCtx): Promise<Result<void, StoreError>> {
      const { error } = await db.rpc("app_setting_set", {
        p_key: "sources.default_frequency_minutes",
        p_value: minutes,
        p_ctx: ctxJson(ctx),
        p_ip_hash: ctx.ipHash ?? undefined,
      });
      return error ? err(mapDbError(error)) : ok(undefined);
    },

    async fastLane(): Promise<FastLaneState> {
      const max = await setting("sources.fast_lane_max", 10);
      const { data } = await db
        .from("sources")
        .select("status")
        .is("archived_at", null)
        .lt("frequency_minutes", 30);
      const rows = data ?? [];
      return {
        max,
        used: rows.length,
        paused: rows.filter((r) => r.status !== "active" && r.status !== "degraded").length,
      };
    },

    async setFastLaneMax(n: number, ctx: AuditCtx): Promise<Result<void, StoreError>> {
      const { error } = await db.rpc("app_setting_set", {
        p_key: "sources.fast_lane_max",
        p_value: n,
        p_ctx: ctxJson(ctx),
        p_ip_hash: ctx.ipHash ?? undefined,
      });
      return error ? err(mapDbError(error)) : ok(undefined);
    },

    /**
     * Logotipo no bucket público `source-logos` (D-F25). A validação (PNG/WebP, 200 KB, quadrado,
     * ≥ 96 px) é da action; aqui só grava. Caminho com hash do conteúdo: cache seguro.
     */
    async uploadLogo(
      id: string,
      file: { bytes: Uint8Array; contentType: "image/png" | "image/webp" },
    ): Promise<Result<{ path: string }, "unavailable">> {
      const path = logoObjectPath(id, file.bytes, file.contentType);
      try {
        const client = opts.storage ? opts.storage() : db;
        const { error } = await client.storage
          .from("source-logos")
          .upload(path, file.bytes, { contentType: file.contentType, upsert: true });
        return error ? err("unavailable") : ok({ path });
      } catch {
        return err("unavailable");
      }
    },

    /** Apaga um logotipo enviado que não chegou a ser gravado na fonte (sem órfão no bucket). */
    async removeLogo(path: string): Promise<void> {
      try {
        const client = opts.storage ? opts.storage() : db;
        await client.storage.from("source-logos").remove([path]);
      } catch (e) {
        console.error("painel de fontes: remoção de logotipo órfão falhou", path, e);
      }
    },

    /** Última mudança auditada da fonte (quem e quando), para a mensagem de conflito. */
    async lastChange(id: string): Promise<{ actorName: string | null; at: string } | null> {
      const { data } = await db
        .from("audit_log_view")
        .select("actor, at")
        .eq("object_ref", `source:${id}`)
        .like("action", "source.%")
        .order("id", { ascending: false })
        .limit(1)
        .returns<{ actor: string; at: string }[]>()
        .maybeSingle();
      if (!data) return null;
      if (!/^[0-9a-f-]{36}$/i.test(data.actor)) return { actorName: null, at: data.at };
      const { data: profile } = await db
        .from("profiles")
        .select("display_name")
        .eq("id", data.actor)
        .maybeSingle();
      return { actorName: profile?.display_name ?? null, at: data.at };
    },

    /** Linha de auditoria em nome da pessoa (aprovações, coletar agora, teste, análise). */
    async audit(entry: {
      actor: string;
      action: string;
      objectRef: string;
      details: Record<string, unknown>;
      ipHash?: string | null;
    }): Promise<void> {
      const { error } = await db.from("audit_log").insert({
        actor: entry.actor,
        action: entry.action,
        object_ref: entry.objectRef,
        details: entry.details as NonNullable<Json>,
        ip_hash: entry.ipHash ?? null,
      });
      if (error) throw new Error(`audit_log: ${error.message}`);
    },
  };
  return store;
}

export type SourceAdminStore = ReturnType<typeof createSourceAdminStore>;

function bulkReason(message: string): BulkReason {
  if (/via rápida está cheia/.test(message)) return "fast_lane_full";
  if (/antes de colocá-la na via rápida/.test(message)) return "not_active";
  if (/já não está ativa/.test(message)) return "already_paused";
  if (/não está pausada/.test(message)) return "not_paused";
  if (/não encontrada/.test(message)) return "not_found";
  return "failed";
}
