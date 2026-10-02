import "server-only";
import { z } from "zod";
import { CORRECTIONS_TEXT as T, EDITOR_TEXT } from "@/content/pt-BR/studio";
import type { Json } from "@/lib/db/types";
import { studioAction, StudioFailure } from "./action";
import type { StudioContext } from "./context";
import { diffText } from "./diff";
import { docText } from "./doc";
import { articleCacheTags } from "./queue";
import { DraftDocSchema } from "./save";
import { articleScope } from "./scope";

async function correctionScope(ctx: StudioContext, id: string) {
  const { data } = await ctx.db.from("corrections").select("article_id").eq("id", id).maybeSingle();
  return data ? articleScope(ctx, data.article_id) : null;
}

const OpenInput = z.object({
  articleId: z.uuid(),
  kind: z.enum(["correction", "right_of_reply"]),
  requestedBy: z.string().trim().min(1).max(120),
  reportId: z.uuid().nullable().optional(),
});
export type OpenCorrectionInput = z.infer<typeof OpenInput>;

/**
 * Abre um pedido de correção ou de direito de resposta para uma matéria (`correction.manage`:
 * editor-chefe, editor na editoria, revisor). Prazo de 24 h; vínculo opcional com a denúncia.
 */
export const openCorrection = studioAction(
  "correction.manage",
  (i: OpenCorrectionInput, ctx) => articleScope(ctx, i.articleId),
  async (i, ctx) => {
    if (i.reportId) {
      // A denúncia vinculada precisa ser desta matéria (achado 16 do gate P4).
      const { data: rep } = await ctx.db
        .from("reports")
        .select("content_ref")
        .eq("id", i.reportId)
        .maybeSingle();
      if (!rep || rep.content_ref !== `article:${i.articleId}`)
        throw new StudioFailure("invalid", T.reportMismatch);
    }
    const { data, error } = await ctx.db
      .from("corrections")
      .insert({
        article_id: i.articleId,
        kind: i.kind,
        public_note: "",
        requested_by: i.requestedBy,
        status: "open",
        report_id: i.reportId ?? null,
      })
      .select("id")
      .single();
    if (error || !data) throw new StudioFailure("forbidden");
    ctx.detail({ correction: data.id, kind: i.kind });
    return { id: data.id };
  },
  { schema: OpenInput, objectRef: (i) => `article:${i.articleId}`, auditAs: "correction.open" },
);

const PublishInput = z.object({
  id: z.uuid(),
  baseVersion: z.number().int().min(0),
  doc: DraftDocSchema.pick({ title: true, dek: true, body: true }),
  publicNote: z.string().trim().min(1, T.noteRequired).max(1000),
  notifySavers: z.boolean(),
});
export type PublishCorrectionInput = z.input<typeof PublishInput>;

/**
 * Publica a correção (Review Focus 3): versão `correction` com a nota pública, matéria
 * `updated`, correção listada em /correcoes e aviso a quem salvou a matéria. Versão base
 * desatualizada → `conflict` com o diff, como no editor.
 */
export const publishCorrection = studioAction(
  "correction.manage",
  (i: PublishCorrectionInput, ctx) => correctionScope(ctx, i.id),
  async (raw, ctx) => {
    const i = PublishInput.parse(raw);
    const { data: c } = await ctx.db
      .from("corrections")
      .select("article_id")
      .eq("id", i.id)
      .single();
    if (!c) throw new StudioFailure("not_found");
    ctx.setObjectRef(`article:${c.article_id}`);
    const { data, error } = await ctx.db.rpc("studio_publish_correction", {
      p_correction: i.id,
      p_base: i.baseVersion,
      p_patch: i.doc as Json,
      p_note: i.publicNote,
      p_notify: i.notifySavers,
    });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden");
      throw new Error(`correção: ${error.message}`);
    }
    const r = (data ?? {}) as {
      status?: string;
      version?: number;
      notified?: number;
      fields?: string[];
      snapshot?: Record<string, unknown>;
    };
    if (r.status === "not_found") throw new StudioFailure("not_found");
    if (r.status === "already_published") throw new StudioFailure("invalid", T.alreadyPublished);
    if (r.status === "not_public") throw new StudioFailure("invalid", T.notPublic);
    if (r.status === "note_required") throw new StudioFailure("invalid", T.noteRequired);
    if (r.status === "conflict") {
      const s = r.snapshot ?? {};
      const text = (v: unknown) => (typeof v === "string" ? v : "");
      throw new StudioFailure("conflict", T.conflict, {
        version: r.version ?? 0,
        diff: {
          title: diffText(text(s.title), i.doc.title),
          dek: diffText(text(s.dek), i.doc.dek),
          body: diffText(docText(s.body), docText(i.doc.body)),
        },
      });
    }
    ctx.detail({ correction: i.id, version: r.version, notified: r.notified, fields: r.fields });
    await ctx.revalidate(await articleCacheTags(ctx, c.article_id));
    return { version: r.version ?? 0, notified: r.notified ?? 0, fields: r.fields ?? [] };
  },
  { objectRef: (i) => `correction:${i.id}`, auditAs: "correction.publish" },
);

const UpdateInput = z.object({
  id: z.uuid(),
  baseVersion: z.number().int().min(0),
  doc: DraftDocSchema,
  publicNote: z.string().trim().min(1, T.updateNoteRequired).max(1000),
});
export type PublishUpdateInput = z.input<typeof UpdateInput>;

/**
 * Modo "Atualização" de matéria publicada (E04): novo fato no texto público, versão `update`
 * com nota pública e cache invalidado (`article.publish`). Pelo banco (`studio_publish_update`,
 * security definer): é o único caminho, fora a Correção, para mudar o texto público.
 */
export const publishUpdate = studioAction(
  "article.publish",
  (i: PublishUpdateInput, ctx) => articleScope(ctx, i.id),
  async (raw, ctx) => {
    const i = UpdateInput.parse(raw);
    const { data, error } = await ctx.db.rpc("studio_publish_update", {
      p_id: i.id,
      p_base: i.baseVersion,
      p_patch: i.doc as Json,
      p_note: i.publicNote,
    });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden");
      if (error.code === "22023") throw new StudioFailure("invalid", EDITOR_TEXT.aiMarkForged);
      throw new Error(`atualização: ${error.message}`);
    }
    const r = (data ?? {}) as {
      status?: string;
      version?: number;
      snapshot?: Record<string, unknown>;
    };
    if (r.status === "not_found") throw new StudioFailure("not_found");
    if (r.status === "not_public") throw new StudioFailure("invalid", T.notPublic);
    if (r.status === "note_required") throw new StudioFailure("invalid", T.updateNoteRequired);
    if (r.status === "conflict") {
      const s = r.snapshot ?? {};
      const text = (v: unknown) => (typeof v === "string" ? v : "");
      throw new StudioFailure("conflict", T.conflict, {
        version: r.version ?? 0,
        diff: {
          title: diffText(text(s.title), i.doc.title),
          dek: diffText(text(s.dek), i.doc.dek),
          body: diffText(docText(s.body), docText(i.doc.body)),
        },
      });
    }
    const version = r.version ?? i.baseVersion + 1;
    ctx.detail({ version, publicNote: i.publicNote });
    await ctx.revalidate(await articleCacheTags(ctx, i.id));
    return { version };
  },
  { objectRef: (i) => `article:${i.id}`, auditAs: "article.update" },
);
