import "server-only";
import type { Json } from "@/lib/db/types";
import type { PushRequest } from "@/lib/push/schemas";
import { err, ok, type Result } from "@/lib/result";
import type { DbClient } from "./client";

/**
 * Escrita de A09 (spec 2026-09-28 §10, §11.5): tudo pelas RPCs `security invoker` de 0041 com a
 * sessão da pessoa, então RLS, `guard_push_sends` e `guard_push_approvals` valem (quem pede não
 * aprova, texto imutável, cancelar só quem pediu ou `push.settings`). Erros do banco viram
 * códigos estáveis; a tela traduz em `notifications-admin.ts`.
 */

export type PushAdminError =
  | "self_approval"
  | "forbidden"
  | "not_pending"
  | "invalid"
  | "article_invalid"
  | "national_scope"
  | "conflict"
  | "unavailable";

export interface SettingCtx {
  reason?: string | null;
  ipHash?: string | null;
}

export interface PushAdminStore {
  request(input: PushRequest): Promise<Result<{ id: string }, PushAdminError>>;
  /** Devolve o estado seguinte (`queued` agora, `scheduled` com horário). */
  approve(id: string): Promise<Result<{ status: "queued" | "scheduled" }, PushAdminError>>;
  reject(id: string, reason: string): Promise<Result<void, PushAdminError>>;
  cancel(id: string, reason: string): Promise<Result<void, PushAdminError>>;
  pause(reason: string): Promise<Result<void, PushAdminError>>;
  requestResume(reason: string): Promise<Result<{ approvalId: string }, PushAdminError>>;
  approveResume(approvalId: string): Promise<Result<void, PushAdminError>>;
  setSetting(
    key: PushSettingKey,
    value: Json,
    ctx: SettingCtx,
  ): Promise<Result<void, PushAdminError>>;
}

export const PUSH_SETTING_KEYS = [
  "push.default_daily_limit",
  "push.quiet_start",
  "push.quiet_end",
  "push.templates",
] as const;
export type PushSettingKey = (typeof PUSH_SETTING_KEYS)[number];

type DbError = { code?: string; message: string; hint?: string | null };

/** Traduz o erro do PostgREST/Postgres (0041) num código estável. */
export function mapPushDbError(e: DbError): PushAdminError {
  const m = e.message ?? "";
  if (e.code === "PT409" || /conflito de versão/.test(m)) return "conflict";
  if (
    /decisão já tomada|já encerrado|está (queued|scheduled|rejected|cancelled|expired|sent|paused|dispatching)/.test(
      m,
    )
  )
    return "not_pending";
  if (/quem pede não decide|outra pessoa|quem tem permissão de aprovar/.test(m))
    return "self_approval";
  if (/Só matéria publicada|atrocinada|Matéria despublicada/.test(m)) return "article_invalid";
  if (e.code === "P0002" || /não encontrado/.test(m)) return "not_pending";
  if (e.code === "42501" || /sem permissão|só por admin|própria editoria/.test(m))
    return "forbidden";
  if (
    e.code === "23514" ||
    e.code === "22023" ||
    e.code === "22P02" ||
    e.code === "23502" ||
    /inválid|Informe|silêncio|7 dias|já passou|só sai agora|deve ser/.test(m)
  )
    return "invalid";
  return "unavailable";
}

type Reply<T> = PromiseLike<{ data: T | null; error: DbError | null }>;

export function createPushAdminStore(db: DbClient): PushAdminStore {
  const run = async <T>(call: () => Reply<T>): Promise<Result<T | null, PushAdminError>> => {
    try {
      const { data, error } = await call();
      if (error) return err(mapPushDbError(error));
      return ok(data);
    } catch (e) {
      return err(mapPushDbError({ message: e instanceof Error ? e.message : String(e) }));
    }
  };

  return {
    async request(input) {
      const r = await run(() => db.rpc("push_request", { p: input as unknown as Json }));
      if (!r.ok) return r;
      return r.value ? ok({ id: r.value }) : err("unavailable");
    },
    async approve(id) {
      const r = await run(() => db.rpc("push_approve", { p_send: id }));
      if (!r.ok) return r;
      return ok({ status: r.value === "scheduled" ? "scheduled" : "queued" });
    },
    async reject(id, reason) {
      const r = await run(() => db.rpc("push_reject", { p_send: id, p_reason: reason }));
      return r.ok ? ok(undefined) : r;
    },
    async cancel(id, reason) {
      const r = await run(() => db.rpc("push_cancel", { p_send: id, p_reason: reason }));
      return r.ok ? ok(undefined) : r;
    },
    async pause(reason) {
      const r = await run(() => db.rpc("push_settings_pause", { p_reason: reason }));
      return r.ok ? ok(undefined) : r;
    },
    async requestResume(reason) {
      const r = await run(() => db.rpc("push_resume_request", { p_reason: reason }));
      if (!r.ok) return r;
      return r.value ? ok({ approvalId: r.value }) : err("unavailable");
    },
    async approveResume(approvalId) {
      const r = await run(() => db.rpc("push_resume_approve", { p_approval: approvalId }));
      return r.ok ? ok(undefined) : r;
    },
    async setSetting(key, value, ctx) {
      const r = await run(() =>
        db.rpc("app_setting_set", {
          p_key: key,
          p_value: value,
          p_ctx: { reason: ctx.reason ?? null } as Json,
          ...(ctx.ipHash ? { p_ip_hash: ctx.ipHash } : {}),
        }),
      );
      return r.ok ? ok(undefined) : r;
    },
  };
}
