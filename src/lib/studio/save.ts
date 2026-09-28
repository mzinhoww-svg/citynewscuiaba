import "server-only";
import { z } from "zod";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import type { Json } from "@/lib/db/types";
import { studioAction, StudioFailure, type ActionContext } from "./action";
import { diffText, type DiffOp } from "./diff";
import { aiParagraph, appendParagraph, docText } from "./doc";
import { articleScope } from "./scope";

/** Campos com origem marcada (IA aceita por pessoa × edição humana). */
export const ORIGIN_FIELDS = ["title", "dek", "seoTitle", "seoDescription"] as const;
export type OriginField = (typeof ORIGIN_FIELDS)[number];

export type FieldOrigin =
  | {
      origin: "ai";
      agentId: string;
      promptVersion: number | null;
      acceptedBy: string;
      acceptedByName: string;
      at: string;
    }
  | { origin: "human"; editedBy: string; editedByName: string; at: string };

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

interface Current {
  status: string;
  title: string;
  dek: string;
  seo_title: string | null;
  seo_description: string | null;
  field_origins: Json;
}

async function current(ctx: ActionContext, id: string): Promise<Current> {
  const { data } = await ctx.db
    .from("articles")
    .select("status, title, dek, seo_title, seo_description, field_origins")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new StudioFailure("not_found");
  return data;
}

async function personName(ctx: ActionContext): Promise<string> {
  const { data } = await ctx.db
    .from("profiles")
    .select("display_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  return data?.display_name ?? ctx.session?.email ?? "";
}

function originsOf(v: Json): FieldOrigins {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as FieldOrigins) : {};
}

/**
 * Grava pela função com versão base. Conflito → `conflict` com a versão atual e o diff entre o
 * que está salvo e o que a pessoa tentou salvar; nada é sobrescrito.
 */
async function persist(
  ctx: ActionContext,
  id: string,
  baseVersion: number,
  patch: Record<string, unknown>,
  changeKind: "edit" | "update" | "correction" = "edit",
  publicNote: string | null = null,
): Promise<number> {
  const { data, error } = await ctx.db.rpc("studio_save_draft", {
    p_id: id,
    p_base: baseVersion,
    p_patch: patch as Json,
    p_change_kind: changeKind,
    ...(publicNote ? { p_public_note: publicNote } : {}),
  });
  if (error) {
    if (error.code === "42501") throw new StudioFailure("forbidden");
    throw new Error(`salvar: ${error.message}`);
  }
  const r = (data ?? {}) as {
    status?: string;
    version?: number;
    snapshot?: Record<string, unknown>;
  };
  if (r.status === "not_found") throw new StudioFailure("not_found");
  if (r.status === "conflict") {
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
    throw new StudioFailure("conflict", T.conflict, conflict);
  }
  return r.version ?? baseVersion + 1;
}

export { persist as persistArticle };

/**
 * Salva o rascunho (`article.edit`: editor-chefe, editor na editoria, jornalista nas próprias).
 * Campo alterado à mão ganha origem humana; os demais mantêm a origem (inclusive IA aceita).
 * Matéria publicada só muda pelos modos Atualização e Correção.
 */
export const saveDraft = studioAction(
  "article.edit",
  (i: SaveInput, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    const doc = DraftDocSchema.parse(i.doc);
    const cur = await current(ctx, i.id);
    if (cur.status === "published" || cur.status === "updated")
      throw new StudioFailure("invalid", T.publishedNeedsMode);
    const origins = originsOf(cur.field_origins);
    const before: Record<OriginField, string> = {
      title: cur.title,
      dek: cur.dek,
      seoTitle: cur.seo_title ?? "",
      seoDescription: cur.seo_description ?? "",
    };
    const after: Record<OriginField, string | undefined> = {
      title: doc.title,
      dek: doc.dek,
      seoTitle: doc.seoTitle === undefined ? undefined : (doc.seoTitle ?? ""),
      seoDescription: doc.seoDescription === undefined ? undefined : (doc.seoDescription ?? ""),
    };
    const changed = ORIGIN_FIELDS.filter((f) => after[f] !== undefined && after[f] !== before[f]);
    if (changed.length > 0) {
      const name = await personName(ctx);
      const at = ctx.now().toISOString();
      for (const f of changed)
        origins[f] = { origin: "human", editedBy: ctx.userId, editedByName: name, at };
    }
    const version = await persist(ctx, i.id, i.baseVersion, { ...doc, fieldOrigins: origins });
    ctx.detail({ version, fields: changed });
    return { version };
  },
  { schema: SaveInput, objectRef: (i) => `article:${i.id}`, auditAs: "article.save" },
);

const SuggestionInput = z.object({
  id: z.uuid(),
  articleId: z.uuid(),
  baseVersion: z.number().int().min(0),
});
export type SuggestionInput = z.input<typeof SuggestionInput>;

const FIELD_COLUMN = {
  title: "title",
  dek: "dek",
  seo_title: "seoTitle",
  seo_description: "seoDescription",
} as const;

async function openSuggestion(ctx: ActionContext, id: string, articleId: string) {
  const { data } = await ctx.db
    .from("article_suggestions")
    .select("id, field, value, agent_id, prompt_version, status")
    .eq("id", id)
    .eq("article_id", articleId)
    .maybeSingle();
  if (!data) throw new StudioFailure("not_found");
  if (data.status !== "open") throw new StudioFailure("invalid", T.suggestionDecided);
  return data;
}

async function decide(ctx: ActionContext, id: string, status: "accepted" | "rejected") {
  const { error } = await ctx.db
    .from("article_suggestions")
    .update({ status, decided_by: ctx.userId, decided_at: ctx.now().toISOString() })
    .eq("id", id)
    .eq("status", "open");
  if (error) throw new StudioFailure("forbidden");
}

/**
 * Aplica uma sugestão de IA com clique humano: o campo recebe o texto e a origem
 * `{ origin: "ai", agentId, promptVersion, acceptedBy }`; no corpo, o parágrafo entra com a marca
 * `aiSuggestion`. Grava versão (com versão base) e marca a sugestão como aceita.
 */
export const acceptSuggestion = studioAction(
  "article.edit",
  (i: SuggestionInput, ctx) => articleScope(ctx, i.articleId),
  async (i, ctx) => {
    const s = await openSuggestion(ctx, i.id, i.articleId);
    const cur = await current(ctx, i.articleId);
    if (cur.status === "published" || cur.status === "updated")
      throw new StudioFailure("invalid", T.publishedNeedsMode);
    const name = await personName(ctx);
    const origins = originsOf(cur.field_origins);
    let patch: Record<string, unknown>;
    if (s.field === "body") {
      const { data: a } = await ctx.db
        .from("articles")
        .select("body")
        .eq("id", i.articleId)
        .single();
      patch = {
        body: appendParagraph(
          a?.body,
          aiParagraph(s.value, {
            agentId: s.agent_id,
            promptVersion: s.prompt_version,
            acceptedBy: ctx.userId,
          }),
        ),
      };
    } else {
      const f = FIELD_COLUMN[s.field as keyof typeof FIELD_COLUMN];
      origins[f] = {
        origin: "ai",
        agentId: s.agent_id,
        promptVersion: s.prompt_version,
        acceptedBy: ctx.userId,
        acceptedByName: name,
        at: ctx.now().toISOString(),
      };
      patch = { [f]: s.value, fieldOrigins: origins };
    }
    const version = await persist(ctx, i.articleId, i.baseVersion, patch);
    await decide(ctx, s.id, "accepted");
    ctx.detail({ suggestion: s.id, field: s.field, agentId: s.agent_id, version });
    return { version, field: s.field };
  },
  {
    schema: SuggestionInput,
    objectRef: (i) => `article:${i.articleId}`,
    auditAs: "article.suggestion.accept",
  },
);

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
