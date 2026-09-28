import "server-only";
import { z } from "zod";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import type { Json } from "@/lib/db/types";
import { studioAction, StudioFailure, type ActionContext } from "./action";
import { diffText, type DiffOp } from "./diff";
import { docText } from "./doc";
import { articleScope } from "./scope";

/** Campos com origem marcada (IA aceita por pessoa × edição humana). */
export const ORIGIN_FIELDS = ["title", "dek", "seoTitle", "seoDescription"] as const;
export type OriginField = (typeof ORIGIN_FIELDS)[number];

/**
 * Origem de um campo, como o banco grava (studio_apply_patch / studio_accept_suggestion,
 * migration 0023): só ids. O nome de quem editou ou aceitou é resolvido na leitura; conta
 * excluída aparece como ex-integrante (achado 5 do gate P4).
 */
export type FieldOrigin =
  | {
      origin: "ai";
      agentId: string;
      promptVersion: number | null;
      acceptedBy?: string;
      at: string;
    }
  | { origin: "human"; editedBy?: string; at: string };

export type FieldOrigins = Partial<Record<OriginField, FieldOrigin>>;

const Doc = z.object({ type: z.literal("doc"), content: z.array(z.unknown()) }).loose();

export const DraftDocSchema = z.object({
  title: z.string().trim().max(200),
  dek: z.string().trim().max(400),
  body: Doc,
  sectionSlug: z
    .string()
    .regex(/^[a-z-]{2,40}$/)
    .optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  neighborhoods: z
    .array(z.string().regex(/^[a-z0-9-]{2,60}$/))
    .max(12)
    .optional(),
  seoTitle: z.string().trim().max(120).nullable().optional(),
  seoDescription: z.string().trim().max(300).nullable().optional(),
  topicId: z.uuid().nullable().optional(),
});
export type DraftDoc = z.input<typeof DraftDocSchema>;

const SaveInput = z.object({
  id: z.uuid(),
  baseVersion: z.number().int().min(0),
  doc: DraftDocSchema,
});
export type SaveInput = z.input<typeof SaveInput>;

export type { DiffOp };
export interface ConflictData {
  version: number;
  /** Diff da versão salva por outra pessoa (del) × o que esta pessoa tentou salvar (add). */
  diff: { title: DiffOp[]; dek: DiffOp[]; body: DiffOp[] };
}

const ops = diffText;

interface SaveRpc {
  status?: string;
  version?: number;
  snapshot?: Record<string, unknown>;
  unscheduled?: boolean;
  field?: string;
  agentId?: string;
}

function conflictFrom(r: SaveRpc, patch: Record<string, unknown>): StudioFailure {
  const s = r.snapshot ?? {};
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const conflict: ConflictData = {
    version: r.version ?? 0,
    diff: {
      title: ops(text(s.title), text(patch.title ?? s.title)),
      dek: ops(text(s.dek), text(patch.dek ?? s.dek)),
      body: ops(docText(s.body), docText(patch.body ?? s.body)),
    },
  };
  return new StudioFailure("conflict", T.conflict, conflict);
}

function rpcFailure(error: { code?: string; message: string }, what: string): never {
  if (error.code === "42501") throw new StudioFailure("forbidden");
  if (error.code === "22023") throw new StudioFailure("invalid", T.aiMarkForged);
  throw new Error(`${what}: ${error.message}`);
}

/**
 * Grava pela função com versão base (`studio_save_draft`, security definer com a checagem de
 * papel). O banco calcula a origem de cada campo e ignora status e origens vindos daqui.
 * Publicada → `invalid` (só Atualização/Correção). Agendada editada perde o agendamento.
 * Conflito → `conflict` com a versão atual e o diff; nada é sobrescrito.
 */
async function persist(
  ctx: ActionContext,
  id: string,
  baseVersion: number,
  patch: Record<string, unknown>,
): Promise<{ version: number; unscheduled: boolean }> {
  const { data, error } = await ctx.db.rpc("studio_save_draft", {
    p_id: id,
    p_base: baseVersion,
    p_patch: patch as Json,
  });
  if (error) rpcFailure(error, "salvar");
  const r = (data ?? {}) as SaveRpc;
  if (r.status === "not_found") throw new StudioFailure("not_found");
  if (r.status === "public") throw new StudioFailure("invalid", T.publishedNeedsMode);
  if (r.status === "conflict") throw conflictFrom(r, patch);
  return { version: r.version ?? baseVersion + 1, unscheduled: r.unscheduled === true };
}

/**
 * Salva o rascunho (`article.edit`: editor-chefe, editor na editoria, jornalista nas próprias,
 * inclusive depois de "Pedir ajuste"). Campo alterado à mão ganha origem humana (no banco).
 * Matéria publicada só muda pelos modos Atualização e Correção.
 */
export const saveDraft = studioAction(
  "article.edit",
  (i: SaveInput, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    const doc = DraftDocSchema.parse(i.doc);
    const r = await persist(ctx, i.id, i.baseVersion, doc);
    ctx.detail({ version: r.version, ...(r.unscheduled ? { unscheduled: true } : {}) });
    return r;
  },
  { schema: SaveInput, objectRef: (i) => `article:${i.id}`, auditAs: "article.save" },
);

const SuggestionInput = z.object({
  id: z.uuid(),
  articleId: z.uuid(),
  baseVersion: z.number().int().min(0),
});
export type SuggestionInput = z.input<typeof SuggestionInput>;

async function openSuggestion(ctx: ActionContext, id: string, articleId: string) {
  const { data } = await ctx.db
    .from("article_suggestions")
    .select("id, field, status")
    .eq("id", id)
    .eq("article_id", articleId)
    .maybeSingle();
  if (!data) throw new StudioFailure("not_found");
  if (data.status !== "open") throw new StudioFailure("invalid", T.suggestionDecided);
  return data;
}

/**
 * Aplica uma sugestão de IA com clique humano (`studio_accept_suggestion`): o campo recebe o
 * texto e a origem `{ origin: "ai", agentId, promptVersion, acceptedBy }` (quem aceitou é
 * sempre quem está na sessão); no corpo, o parágrafo entra com a marca `aiSuggestion`. Versão
 * (com versão base) e sugestão aceita na mesma transação.
 */
export const acceptSuggestion = studioAction(
  "article.edit",
  (i: SuggestionInput, ctx) => articleScope(ctx, i.articleId),
  async (i, ctx) => {
    const { data, error } = await ctx.db.rpc("studio_accept_suggestion", {
      p_suggestion: i.id,
      p_article: i.articleId,
      p_base: i.baseVersion,
    });
    if (error) rpcFailure(error, "aceitar sugestão");
    const r = (data ?? {}) as SaveRpc;
    if (r.status === "not_found") throw new StudioFailure("not_found");
    if (r.status === "decided") throw new StudioFailure("invalid", T.suggestionDecided);
    if (r.status === "public") throw new StudioFailure("invalid", T.publishedNeedsMode);
    if (r.status === "conflict") throw conflictFrom(r, {});
    const version = r.version ?? i.baseVersion + 1;
    ctx.detail({ suggestion: i.id, field: r.field, agentId: r.agentId, version });
    return { version, field: r.field ?? "" };
  },
  {
    schema: SuggestionInput,
    objectRef: (i) => `article:${i.articleId}`,
    auditAs: "article.suggestion.accept",
  },
);

async function decide(ctx: ActionContext, id: string, status: "rejected") {
  const { data, error } = await ctx.db
    .from("article_suggestions")
    .update({ status, decided_by: ctx.userId, decided_at: ctx.now().toISOString() })
    .eq("id", id)
    .eq("status", "open")
    .select("id");
  if (error) throw new StudioFailure("forbidden");
  if (!data?.length) throw new StudioFailure("invalid", T.suggestionDecided);
}

/** Descarta uma sugestão de IA (fica registrada como rejeitada, com quem decidiu). */
export const rejectSuggestion = studioAction(
  "article.edit",
  (i: Omit<SuggestionInput, "baseVersion">, ctx) => articleScope(ctx, i.articleId),
  async (i, ctx) => {
    const s = await openSuggestion(ctx, i.id, i.articleId);
    await decide(ctx, s.id, "rejected");
    ctx.detail({ suggestion: s.id, field: s.field });
    return { id: s.id };
  },
  {
    schema: SuggestionInput.omit({ baseVersion: true }),
    objectRef: (i) => `article:${i.articleId}`,
    auditAs: "article.suggestion.reject",
  },
);
