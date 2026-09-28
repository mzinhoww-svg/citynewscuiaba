import "server-only";
import { z } from "zod";
import { MEDIA_TEXT as T } from "@/content/pt-BR/studio";
import { ImageSchema } from "@/lib/ai/schemas/image";
import { illustrationGuard } from "@/lib/media/licenses";
import { takedownReproduction } from "@/lib/media/takedown";
import { localDateKey } from "@/lib/format/date";
import { studioAction, StudioFailure, type ActionContext } from "./action";
import type { StudioContext } from "./context";
import { articleCacheTags } from "./queue";
import { articleScope, MULTI_SECTION } from "./scope";

/**
 * Escopo de uma imagem (achado 15: determinístico). Usada em uma editoria só: essa editoria
 * (editor aprova na dele). Em mais de uma: escopo que nenhum editor de editoria cobre, só
 * editor-chefe e revisor (o banco confere o mesmo em `can_approve_media`). Sem matéria:
 * escopo sem editoria.
 */
async function mediaScope(ctx: StudioContext, id: string) {
  const { data: m } = await ctx.db.from("media_assets").select("id").eq("id", id).maybeSingle();
  if (!m) return null;
  const { data: links } = await ctx.db
    .from("article_media")
    .select("articles(section_slug)")
    .eq("media_id", id);
  const sections = [
    ...new Set((links ?? []).flatMap((l) => (l.articles ? [l.articles.section_slug] : []))),
  ];
  if (sections.length === 0) return {};
  return { section: sections.length === 1 ? sections[0]! : MULTI_SECTION };
}

async function publicTagsFor(ctx: ActionContext, mediaId: string): Promise<string[]> {
  const { data } = await ctx.db
    .from("article_media")
    .select("article_id, articles(status)")
    .eq("media_id", mediaId);
  const tags: string[] = [];
  for (const r of data ?? [])
    if (r.articles?.status === "published" || r.articles?.status === "updated")
      tags.push(...(await articleCacheTags(ctx, r.article_id)));
  return tags;
}

const Only = z.object({ id: z.uuid() });
type Only = z.infer<typeof Only>;

/**
 * Aprovar imagem (E10, `media.approve`): passa a aparecer nas matérias públicas que a usam.
 * Imagem bloqueada (inclusive remoção a pedido do veículo) não volta, e licença vencida não
 * aprova (achado 7); o banco recusa o mesmo por gatilho.
 */
export const approveImage = studioAction(
  "media.approve",
  (i: Only, ctx) => mediaScope(ctx, i.id),
  async (i, ctx) => {
    const { data: m } = await ctx.db
      .from("media_assets")
      .select("status, license_until")
      .eq("id", i.id)
      .maybeSingle();
    if (!m) throw new StudioFailure("not_found");
    if (m.status === "blocked") throw new StudioFailure("invalid", T.approveBlocked);
    if (m.license_until !== null && m.license_until < localDateKey(ctx.now()))
      throw new StudioFailure("invalid", T.approveExpired);
    const { data, error } = await ctx.db
      .from("media_assets")
      .update({ status: "approved" })
      .eq("id", i.id)
      .neq("status", "blocked")
      .select("id");
    if (error || !data?.length) throw new StudioFailure("forbidden");
    await ctx.revalidate(await publicTagsFor(ctx, i.id));
    return { id: i.id, status: "approved" as const };
  },
  { schema: Only, objectRef: (i) => `media:${i.id}` },
);

const BlockInput = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1, T.reasonRequired).max(300),
});
type BlockInput = z.infer<typeof BlockInput>;

/** Bloquear imagem com motivo: some do portal na hora (RLS só mostra aprovadas). */
export const blockImage = studioAction(
  "media.approve",
  (i: BlockInput, ctx) => mediaScope(ctx, i.id),
  async (i, ctx) => {
    const { data, error } = await ctx.db
      .from("media_assets")
      .update({ status: "blocked", removed_at: ctx.now().toISOString(), removal_reason: i.reason })
      .eq("id", i.id)
      .select("id");
    if (error || !data?.length) throw new StudioFailure("forbidden");
    ctx.detail({ reason: i.reason });
    await ctx.revalidate(await publicTagsFor(ctx, i.id));
    return { id: i.id, status: "blocked" as const };
  },
  { schema: BlockInput, objectRef: (i) => `media:${i.id}`, auditAs: "media.block" },
);

const TakedownInput = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1, T.reasonRequired).max(300),
  /** Opt-out do veículo: remove todas as reproduções da mesma fonte. */
  allFromSource: z.boolean().optional(),
});
type TakedownInput = z.infer<typeof TakedownInput>;

/**
 * Remover a pedido do veículo (CLAUDE.md §5.11, em até 24 h; A-010): só para reprodução.
 * Bloqueia (sai do portal na hora), apaga a cópia do Storage, mantém a URL de origem como
 * bloqueada (o pipeline não copia de novo), invalida as matérias e audita `media.takedown` por
 * imagem. Com `allFromSource`, remove todas as reproduções do veículo. A guarda de papel é a
 * do `media.approve`; a remoção roda com o service role (Storage) depois da guarda.
 */
export const takedownImage = studioAction(
  "media.approve",
  (i: TakedownInput, ctx) => mediaScope(ctx, i.id),
  async (i, ctx) => {
    const { data: m } = await ctx.db
      .from("media_assets")
      .select("kind, source_id")
      .eq("id", i.id)
      .maybeSingle();
    if (!m) throw new StudioFailure("not_found");
    if (m.kind !== "reproduction") throw new StudioFailure("invalid", T.takedownOnlyReproduction);
    const [{ createServiceClient }, { createMediaRepo }, { productionMediaStore }] =
      await Promise.all([
        import("@/lib/db/client"),
        import("@/lib/db/pipeline-store"),
        import("@/lib/pipeline/deps"),
      ]);
    const service = createServiceClient();
    const target = i.allFromSource && m.source_id ? { sourceId: m.source_id } : { mediaId: i.id };
    const r = await takedownReproduction(
      {
        repo: createMediaRepo(service),
        store: ctx.mediaStore ?? productionMediaStore(service),
        revalidate: async (tags) => {
          const extra: string[] = [];
          for (const t of tags) {
            const id = t.startsWith("article:") ? t.slice("article:".length) : null;
            if (id) extra.push(...(await articleCacheTags(ctx, id)));
          }
          await ctx.revalidate([...new Set([...tags, ...extra])]);
        },
        now: ctx.now,
      },
      target,
      ctx.userId,
      i.reason,
    );
    if (!r.ok) throw new StudioFailure("invalid", T.reasonRequired);
    ctx.detail({ reason: i.reason, blocked: r.value.blocked, ...target });
    return r.value;
  },
  { schema: TakedownInput, objectRef: (i) => `media:${i.id}`, auditAs: "media.takedown.request" },
);

const ReplaceInput = z.object({ articleId: z.uuid(), mediaId: z.uuid() });
type ReplaceInput = z.infer<typeof ReplaceInput>;

/**
 * Trocar a imagem de uma matéria (troca sugerida no alerta de licença vencida): só por imagem
 * aprovada e com licença válida hoje.
 */
export const replaceImage = studioAction(
  "article.edit",
  (i: ReplaceInput, ctx) => articleScope(ctx, i.articleId),
  async (i, ctx) => {
    // Troca atômica no banco (achado 13): só por imagem aprovada e com licença válida hoje.
    const { data, error } = await ctx.db.rpc("studio_replace_image", {
      p_article: i.articleId,
      p_media: i.mediaId,
    });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden");
      throw new Error(`trocar imagem: ${error.message}`);
    }
    const r = (data ?? {}) as { status?: string; from?: string[] };
    if (r.status === "not_found") throw new StudioFailure("not_found");
    if (r.status === "invalid") throw new StudioFailure("invalid", T.replaceInvalid);
    const old = (r.from ?? []).map((media_id) => ({ media_id }));
    ctx.detail({ from: (old ?? []).map((o) => o.media_id), to: i.mediaId });
    await ctx.revalidate(await articleCacheTags(ctx, i.articleId));
    return { articleId: i.articleId, mediaId: i.mediaId };
  },
  { schema: ReplaceInput, objectRef: (i) => `article:${i.articleId}`, auditAs: "media.replace" },
);

const RenewInput = z.object({
  license: z.string().trim().min(1).max(300),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
type RenewInput = z.infer<typeof RenewInput>;

/** Renovar uma licença (banco ou contrato): nova vigência para todas as imagens dela. */
export const renewLicense = studioAction(
  "media.approve",
  () => ({}),
  async (i: RenewInput, ctx) => {
    if (i.until < localDateKey(ctx.now()))
      throw new StudioFailure("invalid", "Escolha uma data futura");
    const { data, error } = await ctx.db
      .from("media_assets")
      .update({ license_until: i.until })
      .eq("license", i.license)
      .neq("status", "blocked")
      .select("id");
    if (error) throw new StudioFailure("forbidden");
    ctx.detail({ license: i.license, until: i.until, images: data?.length ?? 0 });
    return { count: data?.length ?? 0 };
  },
  { schema: RenewInput, objectRef: (i) => `license:${i.license}`, auditAs: "media.license.renew" },
);

const LicenseOnly = z.object({ license: z.string().trim().min(1).max(300) });
type LicenseOnly = z.infer<typeof LicenseOnly>;

/** Bloquear as imagens vencidas de uma licença (saem do portal). */
export const blockExpired = studioAction(
  "media.approve",
  () => ({}),
  async (i: LicenseOnly, ctx) => {
    const today = localDateKey(ctx.now());
    const { data, error } = await ctx.db
      .from("media_assets")
      .update({
        status: "blocked",
        removed_at: ctx.now().toISOString(),
        removal_reason: "Licença vencida",
      })
      .eq("license", i.license)
      .lt("license_until", today)
      .neq("status", "blocked")
      .select("id");
    if (error) throw new StudioFailure("forbidden");
    const tags: string[] = [];
    for (const m of data ?? []) tags.push(...(await publicTagsFor(ctx, m.id)));
    await ctx.revalidate(tags);
    ctx.detail({ license: i.license, images: data?.length ?? 0 });
    return { count: data?.length ?? 0 };
  },
  { schema: LicenseOnly, objectRef: (i) => `license:${i.license}`, auditAs: "media.license.block" },
);

const GenerateInput = z.object({ articleId: z.uuid() });
type GenerateInput = z.infer<typeof GenerateInput>;

export interface IllustrationSuggestion {
  restrictions: string[];
  prompt: string;
  alt: string;
  /** Opções geradas; vazio enquanto não há gerador de imagem configurado. */
  options: { id: string }[];
  generatorAvailable: boolean;
}

/**
 * Geração de ilustração (E12): recusa Segurança, tema sensível e etiquetas de crime, tragédia
 * ou saúde individual antes de chamar a IA; o agente `image` decide e descreve (texto da
 * matéria vai como dado). Sem gerador de imagem configurado (A-038), devolve a descrição e as
 * restrições, sem opções; nada é salvo no acervo.
 */
export const generateIllustration = studioAction(
  "article.edit",
  (i: GenerateInput, ctx) => articleScope(ctx, i.articleId),
  async (i, ctx) => {
    const [{ data: q }, { data: a }] = await Promise.all([
      ctx.db.from("studio_queue").select("category, sensitive").eq("id", i.articleId).maybeSingle(),
      ctx.db.from("articles").select("title, dek, tags").eq("id", i.articleId).maybeSingle(),
    ]);
    if (!a) throw new StudioFailure("not_found");
    const guard = illustrationGuard({
      category: q?.category ?? "",
      sensitive: q?.sensitive ?? false,
      tags: a.tags,
    });
    if (!guard.ok) throw new StudioFailure("invalid", guard.error);

    const { createProductionAi } = await import("@/lib/ai/server");
    const ai = createProductionAi();
    const r = await ai.callAgent(
      "image",
      {
        system: `Restrições fixas: ${guard.value.restrictions.join("; ")}.`,
        data: [{ id: `article:${i.articleId}`, text: `${a.title}\n${a.dek}` }],
        task: "Decida se a matéria permite ilustração gerada e descreva uma ilustração editorial simples.",
      },
      ImageSchema,
    );
    if (!r.ok) throw new StudioFailure("invalid", T.aiUnavailable);
    if (!r.value.allowed) throw new StudioFailure("invalid", r.value.reason);
    ctx.detail({ agent: "image", allowed: true });
    const out: IllustrationSuggestion = {
      restrictions: guard.value.restrictions,
      prompt: r.value.prompt,
      alt: r.value.alt,
      options: [],
      generatorAvailable: false,
    };
    return out;
  },
  { schema: GenerateInput, objectRef: (i) => `article:${i.articleId}`, auditAs: "media.generate" },
);
