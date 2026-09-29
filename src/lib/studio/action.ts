import "server-only";
import type { ZodType } from "zod";
import { can, canAccess, type Action, type Scope } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import { readOnlyNotice } from "@/lib/flags";
import { studioContext, type StudioContext } from "./context";

/**
 * Erros tipados das Server Actions do Estúdio. `not_found` complementa o contrato do plano
 * (forbidden, conflict, invalid) para objeto inexistente ou invisível pela RLS.
 */
export type StudioError = "forbidden" | "conflict" | "invalid" | "not_found" | "read_only";

export type StudioFail = {
  ok: false;
  error: StudioError;
  /** Texto para a pessoa (pt-BR), quando o erro tem explicação. */
  message?: string;
  /** Dados do erro para a tela (ex.: versão atual e diff no conflito de salvamento). */
  data?: unknown;
};
export type StudioResult<O> = { ok: true; value: O } | StudioFail;

/** Falha de domínio lançada dentro de uma ação; vira `{ ok: false, error, message }`. */
export class StudioFailure extends Error {
  readonly userMessage?: string;
  constructor(
    readonly code: StudioError,
    message?: string,
    readonly data?: unknown,
  ) {
    super(message ?? code);
    this.name = "StudioFailure";
    this.userMessage = message;
  }
}

export interface ActionContext extends StudioContext {
  userId: string;
  /** Acrescenta detalhes à linha de auditoria do sucesso. */
  detail: (details: Record<string, unknown>) => void;
  /** Referência do objeto na auditoria, quando só se sabe dentro da ação (ex.: id criado). */
  setObjectRef: (ref: string) => void;
}

export interface StudioActionOptions<I> {
  /** Validação da entrada; falha vira `invalid` com a primeira mensagem. */
  schema?: ZodType<I>;
  /** Objeto na auditoria (`article:<id>`). Padrão: `<ação>:` + id da entrada, se houver. */
  objectRef?: (input: I) => string;
  /** Nome na auditoria, quando difere da ação de permissão (ex.: article.save). */
  auditAs?: AuditAction;
}

function defaultRef(action: Action, input: unknown): string {
  const id = typeof input === "object" && input !== null && "id" in input ? String(input.id) : "";
  return `${action.split(".")[0]}:${id}`;
}

function fail(error: StudioError, message?: string, data?: unknown): StudioFail {
  const out: StudioFail = { ok: false, error };
  if (message !== undefined) out.message = message;
  if (data !== undefined) out.data = data;
  return out;
}

/**
 * Envolve uma mutação do Estúdio: valida a entrada, resolve o escopo (editoria, autoria) do
 * objeto, checa o papel com `can` (Server Action chamada direto não escapa), executa e audita.
 * Negação grava `<ação>.denied` e devolve `forbidden` sem executar nada.
 *
 * `scopeOf` pode ler o banco (com a sessão da pessoa); `null` = objeto não encontrado.
 */
export function studioAction<I, O>(
  action: Action,
  scopeOf: (input: I, ctx: StudioContext) => Scope | null | Promise<Scope | null>,
  fn: (input: I, ctx: ActionContext) => Promise<O>,
  options: StudioActionOptions<I> = {},
): (input: I) => Promise<StudioResult<O>> {
  return async (raw: I) => {
    let input = raw;
    if (options.schema) {
      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) return fail("invalid", parsed.error.issues[0]?.message);
      input = parsed.data;
    }
    const ctx = await studioContext();
    const session = ctx.session;
    if (!session) return fail("forbidden");
    // Modo leitura (contingência): o Estúdio não grava. Vem depois da sessão, antes de qualquer
    // leitura do objeto, e não depende de cache.
    const blocked = await readOnlyNotice();
    if (blocked) return fail("read_only", blocked);

    let objectRef = options.objectRef?.(input) ?? defaultRef(action, input);
    const denied = async (scope: Scope | null) => {
      await audit(
        session.userId,
        `${options.auditAs ?? action}.denied`,
        objectRef,
        { scope },
        ctx.db,
      );
      return fail("forbidden");
    };
    // Sem o papel em escopo nenhum, nega (com rastro) antes de olhar o objeto: a RLS pode
    // esconder o objeto de quem não é da equipe, e isso não pode virar "não encontrado" mudo.
    if (!canAccess(session.roles, action)) return denied(null);
    const scope = await scopeOf(input, ctx);
    if (scope === null) return fail("not_found");
    if (!can(session.roles, action, { ...scope, userId: session.userId })) return denied(scope);

    const details: Record<string, unknown> = {};
    try {
      const value = await fn(input, {
        ...ctx,
        userId: session.userId,
        detail: (d) => Object.assign(details, d),
        setObjectRef: (ref) => {
          objectRef = ref;
        },
      });
      await audit(session.userId, options.auditAs ?? action, objectRef, details, ctx.db);
      return { ok: true, value };
    } catch (e) {
      if (e instanceof StudioFailure) return fail(e.code, e.userMessage, e.data);
      throw e;
    }
  };
}
