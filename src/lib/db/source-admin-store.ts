import "server-only";
import { z } from "zod";
import { SOURCE_MESSAGES as M } from "@/content/pt-BR/sources-admin";
import { formatHour } from "@/lib/format/date";
import { ok } from "@/lib/result";
import type { SourceConfig } from "@/lib/sources/types";
import type { DbClient } from "./client";
import { readSourceSettings } from "./pipeline-store";
import type { Database, Json } from "./types";

/*
 * Escrita do painel de fontes (FS-T6). Tudo passa pelas RPCs `source_admin_*` e `app_setting_set`
 * (SECURITY INVOKER, migration 0011): RLS, o guard de campos críticos, a versão otimista e a auditoria
 * continuam valendo no banco. Este módulo só traduz: campos em camelCase para colunas, erros do
 * banco para códigos e mensagens em pt-BR.
 */

export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];

/** Contexto de auditoria que o trigger grava em `audit_log.details` e `ip_hash`. */
export interface AuditCtx {
  reason?: string | null;
  batchId?: string | null;
  ipHash?: string | null;
}

export type StoreErrorCode =
  | "conflict"
  | "forbidden"
  | "invalid"
  | "not_found"
  | "needs_approval"
  | "duplicate_slug"
  | "fast_lane_full"
  | "fast_lane_inactive";

export interface StoreFail {
  ok: false;
  error: StoreErrorCode;
  /** Texto pronto para a pessoa (pt-BR). */
  message: string;
}
export type StoreResult<T> = { ok: true; value: T } | StoreFail;

const fail = (error: StoreErrorCode, message: string): StoreFail => ({ ok: false, error, message });

/** Colunas editáveis, por nome de campo do `SourceConfig`. */
const COLUMN: Record<keyof SourceConfig, string> = {
  name: "name",
  displayName: "display_name",
  ownerId: "owner_id",
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
  termsMinIntervalMinutes: "terms_min_interval_minutes",
  frequencyMinutes: "frequency_minutes",
  rateLimitPerHour: "rate_limit_per_hour",
  editorialScore: "editorial_score",
  priority: "priority",
};

/** Colunas do banco a partir dos campos alterados de `SourceConfig`. */
export function configPatch(config: Partial<SourceConfig>): { [column: string]: Json } {
  const out: { [column: string]: Json } = {};
  for (const key of Object.keys(config) as (keyof SourceConfig)[]) {
    const value = config[key];
    if (value !== undefined) out[COLUMN[key]] = value as Json;
  }
  return out;
}

/** Configuração editável da fonte, como o painel a enxerga. */
export function rowToConfig(row: SourceRow): SourceConfig {
  const layer = row.layer;
  return {
    name: row.name,
    displayName: row.display_name,
    ownerId: row.owner_id,
    layer: layer === 1 || layer === 2 || layer === 3 || layer === 4 ? layer : null,
    categories: row.categories,
    locality: isLocality(row.locality) ? row.locality : "mt",
    reliability: row.reliability,
    imagePolicy: row.image_policy,
    republishPolicy: row.republish_policy,
    maySoleSource: row.may_be_sole_source,
    agreementUntil: row.agreement_until,
    agreementNote: row.agreement_note,
    termsUrl: row.terms_url,
    termsMinIntervalMinutes: row.terms_min_interval_minutes,
    frequencyMinutes: row.frequency_minutes,
    rateLimitPerHour: row.rate_limit_per_hour,
    editorialScore: row.editorial_score,
    priority: row.priority === 1 || row.priority === 3 ? row.priority : 2,
  };
}

const isLocality = (v: string): v is SourceConfig["locality"] =>
  v === "cuiaba" || v === "varzea-grande" || v === "mt" || v === "nacional";

interface DbErr {
  code?: string;
  message: string;
}

/** Erro do banco → falha tipada. Erro inesperado (infra) é lançado. */
export function mapDbError(error: DbErr): StoreFail {
  const msg = error.message;
  if (error.code === "CV409") return fail("conflict", M.conflictUnknown);
  if (error.code === "P0002") return fail("not_found", M.notFound);
  if (error.code === "23505") return fail("duplicate_slug", M.duplicateSlug);
  if (error.code === "42501") {
    return /aprovação/i.test(msg)
      ? fail("needs_approval", M.needsApproval)
      : fail("forbidden", M.forbidden);
  }
  if (error.code === "22023" || error.code === "23514") {
    if (/via rápida está cheia/i.test(msg)) {
      const m = /(\d+) de (\d+)/.exec(msg);
      return fail("fast_lane_full", m ? M.fastLaneFull(Number(m[1]), Number(m[2])) : msg);
    }
    if (/ative a fonte antes/i.test(msg)) return fail("fast_lane_inactive", M.fastLaneInactive);
    if (error.code === "23514") return fail("invalid", M.invalid);
    return fail("invalid", msg);
  }
  throw new Error(`source-admin-store: ${msg}`);
}

const BulkResult = z.object({
  applied: z.number(),
  skipped: z.number(),
  items: z.array(
    z.object({
      id: z.string(),
      slug: z.string().nullable().optional(),
      outcome: z.enum(["applied", "skipped"]),
      reason: z.string().nullable().optional(),
      message: z.string().nullable().optional(),
    }),
  ),
});

export interface BulkItemResult {
  id: string;
  slug: string | null;
  outcome: "applied" | "ignored";
  /** Código do motivo (`fast_lane_full`, `already_paused`, …). */
  reason: string | null;
  /** Motivo em pt-BR. */
  message: string | null;
}

export type BulkAction = "pause" | "activate" | "frequency";
export type StatusAction = "activate" | "pause" | "block" | "unblock" | "archive" | "restore";

export interface FastLaneUsage {
  max: number;
  /** Fontes não arquivadas com frequência < 30 min (ocupam vaga). */
  used: number;
  /** Dessas, as que não estão coletando (pausadas ou bloqueadas). */
  paused: number;
}

const LOGO_BUCKET = "source-logos";

export function createSourceAdminStore(db: DbClient) {
  const ctxJson = (ctx: AuditCtx): Json => ({
    ...(ctx.reason ? { reason: ctx.reason } : {}),
    ...(ctx.batchId ? { batchId: ctx.batchId } : {}),
    ...(ctx.ipHash ? { ipHash: ctx.ipHash } : {}),
  });

  /** Quem alterou por último e quando (mensagem do conflito de versão). */
  async function conflictFail(id: string): Promise<StoreFail> {
    const last = await db
      .from("audit_log")
      .select("actor, at")
      .eq("object_ref", `source:${id}`)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error || !last.data) return fail("conflict", M.conflictUnknown);
    const { actor, at } = last.data;
    let who: string | null = null;
    if (/^[0-9a-f-]{36}$/i.test(actor)) {
      const p = await db.from("profiles").select("display_name").eq("id", actor).maybeSingle();
      who = p.data?.display_name ?? null;
    } else if (actor === "sistema") {
      who = "o sistema";
    }
    return who
      ? fail("conflict", M.conflict(who, formatHour(at)))
      : fail("conflict", M.conflictUnknown);
  }

  async function failFrom(error: DbErr, id?: string): Promise<StoreFail> {
    if (error.code === "CV409" && id) return conflictFail(id);
    return mapDbError(error);
  }

  return {
    /** Falha de conflito de versão com quem alterou por último e a hora (histórico de auditoria). */
    conflict: (id: string): Promise<StoreFail> => conflictFail(id),

    /** Linha atual da fonte (RLS de equipe). `null` se não existe. */
    async load(id: string): Promise<SourceRow | null> {
      const { data, error } = await db.from("sources").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`source-admin-store: load: ${error.message}`);
      return data;
    },

    /** Cria a fonte (sempre `paused`, `pending_activation`) com as colunas dadas. */
    async create(
      input: { [column: string]: Json },
      ctx: AuditCtx = {},
    ): Promise<StoreResult<{ id: string; version: number }>> {
      const { data, error } = await db.rpc("source_admin_create", {
        p: input,
        p_ctx: ctxJson(ctx),
      });
      if (error) return failFrom(error);
      return ok({ id: data, version: 1 });
    },

    /** Atualiza colunas de configuração com versão otimista. */
    async update(
      id: string,
      version: number,
      patch: { [column: string]: Json },
      ctx: AuditCtx = {},
    ): Promise<StoreResult<{ version: number }>> {
      const { data, error } = await db.rpc("source_admin_update", {
        p_id: id,
        p_version: version,
        p_patch: patch,
        p_ctx: ctxJson(ctx),
      });
      if (error) return failFrom(error, id);
      return ok({ version: data });
    },

    /** Ação de estado: ativar, pausar, bloquear, desbloquear, arquivar (excluir) e restaurar. */
    async setStatus(
      id: string,
      version: number,
      action: StatusAction,
      reason: string | null,
      ctx: AuditCtx = {},
    ): Promise<StoreResult<{ version: number }>> {
      const { data, error } = await db.rpc("source_admin_status", {
        p_id: id,
        p_version: version,
        p_action: action,
        p_reason: reason ?? undefined,
        p_ctx: ctxJson(ctx),
      });
      if (error) return failFrom(error, id);
      return ok({ version: data });
    },

    /**
     * Lote (até 50). Frequência rápida: fonte a fonte, na ordem recebida, até encher as vagas; as
     * demais voltam `ignored` com o motivo.
     */
    async bulk(
      ids: string[],
      action: BulkAction,
      value: { frequency_minutes: number | null } | undefined,
      ctx: AuditCtx = {},
    ): Promise<StoreResult<BulkItemResult[]>> {
      const { data, error } = await db.rpc("source_admin_bulk", {
        p_ids: ids,
        p_action: action,
        p_value: value ?? {},
        p_ctx: ctxJson(ctx),
      });
      if (error) return failFrom(error);
      const parsed = BulkResult.safeParse(data);
      if (!parsed.success) throw new Error("source-admin-store: resposta do lote inesperada");
      return ok(
        parsed.data.items.map((i): BulkItemResult => {
          const reason = i.reason ?? null;
          return {
            id: i.id,
            slug: i.slug ?? null,
            outcome: i.outcome === "applied" ? "applied" : "ignored",
            reason,
            message: reason ? (M.bulk.reason[reason] ?? M.bulk.reason.error ?? null) : null,
          };
        }),
      );
    },

    /** Padrão global de frequência (`app_settings`; 30 min na semente). */
    async defaultFrequency(): Promise<number> {
      return (await readSourceSettings(db)).defaultFrequency;
    },

    async setDefaultFrequency(minutes: number, ctx: AuditCtx = {}): Promise<StoreResult<null>> {
      const { error } = await db.rpc("app_setting_set", {
        p_key: "sources.default_frequency_minutes",
        p_value: minutes,
        p_ctx: ctxJson(ctx),
      });
      return error ? mapDbError(error) : ok(null);
    },

    /** Vagas da via rápida: limite, usadas e, entre elas, as que não estão coletando. */
    async fastLane(): Promise<FastLaneUsage> {
      const [settings, lane] = await Promise.all([
        readSourceSettings(db),
        db.from("sources").select("status").lt("frequency_minutes", 30).is("archived_at", null),
      ]);
      if (lane.error) throw new Error(`source-admin-store: fastLane: ${lane.error.message}`);
      const rows = lane.data ?? [];
      return {
        max: settings.fastLaneMax,
        used: rows.length,
        paused: rows.filter((r) => r.status === "paused" || r.status === "blocked").length,
      };
    },

    async setFastLaneMax(n: number, ctx: AuditCtx = {}): Promise<StoreResult<null>> {
      const { error } = await db.rpc("app_setting_set", {
        p_key: "sources.fast_lane_max",
        p_value: n,
        p_ctx: ctxJson(ctx),
      });
      return error ? mapDbError(error) : ok(null);
    },

    /** Guarda o logo no bucket `source-logos` (a validação de tipo, tamanho e proporção é do chamador). */
    async uploadLogo(
      id: string,
      file: { bytes: Uint8Array; contentType: "image/png" | "image/webp" },
    ): Promise<StoreResult<{ path: string }>> {
      const ext = file.contentType === "image/png" ? "png" : "webp";
      const path = `${id}/logo-${Date.now()}.${ext}`;
      const { error } = await db.storage
        .from(LOGO_BUCKET)
        .upload(path, file.bytes, { contentType: file.contentType, upsert: false });
      if (error) return fail("invalid", M.logo.storage);
      return ok({ path });
    },
  };
}

export type SourceAdminStore = ReturnType<typeof createSourceAdminStore>;
