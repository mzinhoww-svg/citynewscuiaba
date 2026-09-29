import "server-only";
import { z } from "zod";
import { REC_TEXT as T } from "@/content/pt-BR/control-rec";
import { requestApproval, normalizeJustification } from "@/lib/approvals";
import { splitValid, weightsValid, WEIGHT_KEYS, type Weights } from "@/lib/ranking";
import type { Json } from "@/lib/db/types";
import { studioAction, StudioFailure, type ActionContext, type StudioResult } from "./action";

/*
 * Mutações do painel de recomendação (P5-T7). Papel `rec.weights` (admin e operador_ia) e RLS
 * no banco. Pesos novos nunca entram em vigor aqui: viram uma versão proposta e um pedido de
 * aprovação `rec.weights` que outra pessoa decide (spec §8). Nenhuma ação lê ou grava dado
 * pessoal.
 */

const weight = z.number().finite().min(0).max(1);
const WeightsInput = z.object({
  popularity: weight,
  individual: weight,
  recency: weight,
  engagement: weight,
  operational: weight,
  diversity: weight,
});

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const ProposeWeightsInput = z.object({
  weights: WeightsInput,
  cap: z.number().min(0.1).max(0.5),
  discoveryEvery: z.number().int().min(2).max(20),
  justification: z.string().max(4000),
});
export type ProposeWeightsInput = z.infer<typeof ProposeWeightsInput>;

/** Próxima versão `rec-v1.N`: mesmos componentes do rec-v1 com outros pesos (rec-v2 fica para o DP-3). */
function nextVersion(existing: readonly string[], attempt: number): string {
  const max = existing.reduce((m, v) => {
    const hit = /^rec-v1\.(\d{1,6})$/.exec(v);
    return hit ? Math.max(m, Number(hit[1])) : m;
  }, 0);
  return `rec-v1.${max + 1 + attempt}`;
}

/** Insere uma versão proposta (sem aprovação) com a próxima `rec-v1.N`. */
async function insertProposal(
  ctx: Pick<ActionContext, "db" | "userId">,
  weights: Weights,
  cap: number,
  discoveryEvery: number,
): Promise<string> {
  const all = await ctx.db.from("rec_weights").select("version");
  if (all.error) throw new Error(`recomendação: ${all.error.message}`);
  const existing = (all.data ?? []).map((r) => r.version);
  let version = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    version = nextVersion(existing, attempt);
    const { error } = await ctx.db.from("rec_weights").insert({
      version,
      weights: weights as unknown as NonNullable<Json>,
      cap,
      discovery_every: discoveryEvery,
      proposed_by: ctx.userId,
    });
    if (!error) break;
    if (error.code === "23505" && attempt < 2) continue;
    if (error.code === "42501") throw new StudioFailure("forbidden", T.forbidden);
    throw new Error(`recomendação: ${error.message}`);
  }
  return version;
}

export const proposeWeights: (
  input: ProposeWeightsInput,
) => Promise<StudioResult<{ version: string }>> = studioAction(
  "rec.weights",
  () => ({}),
  async (input, ctx) => {
    const justification = normalizeJustification(input.justification);
    if (justification === null) throw new StudioFailure("invalid", T.justificationHint);
    const weights = Object.fromEntries(
      WEIGHT_KEYS.map((k) => [k, round3(input.weights[k])]),
    ) as Weights;
    const check = weightsValid(weights);
    if (!check.ok)
      throw new StudioFailure("invalid", T.sumBad(check.sum.toFixed(2).replace(".", ",")));
    const cap = Math.round(input.cap * 100) / 100;

    const active = await ctx.db
      .from("rec_weights")
      .select("weights, cap, discovery_every")
      .eq("active", true)
      .maybeSingle();
    if (active.error) throw new Error(`recomendação: ${active.error.message}`);
    const same = WeightsInput.safeParse(active.data?.weights);
    if (
      same.success &&
      WEIGHT_KEYS.every((k) => round3(same.data[k]) === weights[k]) &&
      Number(active.data?.cap) === cap &&
      active.data?.discovery_every === input.discoveryEvery
    )
      throw new StudioFailure("invalid", T.unchanged);

    const version = await insertProposal(ctx, weights, cap, input.discoveryEvery);
    ctx.setObjectRef(`rec_weights:${version}`);
    const r = await requestApproval({ kind: "rec.weights", targetRef: version, justification });
    if (!r.ok)
      throw new StudioFailure(r.error === "forbidden" ? "forbidden" : "invalid", r.message);
    ctx.detail({ version, approval: r.value.id, sum: check.sum });
    return { version };
  },
  { schema: ProposeWeightsInput, objectRef: () => "rec_weights:nova" },
);

/* ---------------------------------------------------------------- testes A/B */

const slugify = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);

const CreateExperimentInput = z.object({
  name: z.string().trim().min(3, T.testNameRequired).max(120, T.testNameRequired),
  hypothesis: z.string().trim().max(500).optional(),
  variants: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        weightsVersion: z.string().min(1).max(100),
      }),
    )
    .min(2)
    .max(6),
  /** Frações que somam 1 (a tela converte de porcentagem). */
  split: z.array(z.number()),
});
export type CreateExperimentInput = z.infer<typeof CreateExperimentInput>;

export const createExperiment: (
  input: CreateExperimentInput,
) => Promise<StudioResult<{ id: string }>> = studioAction(
  "rec.weights",
  () => ({}),
  async (input, ctx) => {
    const split = input.split.map((p) => Math.round(p * 1000) / 1000);
    if (split.length !== input.variants.length || !splitValid(split))
      throw new StudioFailure("invalid", T.testSplitInvalid);
    const versions = input.variants.map((v) => v.weightsVersion);
    if (new Set(versions).size !== versions.length)
      throw new StudioFailure("invalid", T.testVariantsInvalid);
    const known = await ctx.db
      .from("rec_weights")
      .select("version")
      .in("version", versions)
      .not("approved_by", "is", null);
    if (known.error) throw new Error(`recomendação: ${known.error.message}`);
    if ((known.data ?? []).length !== versions.length)
      throw new StudioFailure("invalid", T.testVariantsInvalid);

    const base = slugify(input.name);
    for (let attempt = 0; attempt < 4; attempt++) {
      const suffix = Math.random().toString(36).slice(2, 6);
      const id = `${base.length >= 2 ? base : "teste"}-${suffix}`;
      const { error } = await ctx.db.from("rec_experiments").insert({
        id,
        name: input.name,
        hypothesis: input.hypothesis || null,
        variants: input.variants as unknown as NonNullable<Json>,
        split,
        created_by: ctx.userId,
      });
      if (!error) {
        ctx.setObjectRef(`rec_experiment:${id}`);
        ctx.detail({ split, versions });
        return { id };
      }
      if (error.code === "23505") continue;
      if (error.code === "42501") throw new StudioFailure("forbidden", T.forbidden);
      throw new Error(`recomendação: ${error.message}`);
    }
    throw new StudioFailure("invalid", T.invalid);
  },
  { schema: CreateExperimentInput, objectRef: () => "rec_experiment:novo" },
);

const IdInput = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/) });

export const startExperiment: (input: { id: string }) => Promise<StudioResult<{ id: string }>> =
  studioAction(
    "rec.weights",
    () => ({}),
    async ({ id }, ctx) => {
      const { data, error } = await ctx.db
        .from("rec_experiments")
        .update({ status: "running", starts_at: ctx.now().toISOString() })
        .eq("id", id)
        .eq("status", "draft")
        .select("id");
      if (error) throw new Error(`recomendação: ${error.message}`);
      if ((data ?? []).length === 0) throw new StudioFailure("conflict", T.wrongState);
      return { id };
    },
    { schema: IdInput, objectRef: (i) => `rec_experiment:${i.id}` },
  );

const EndInput = z.object({
  id: IdInput.shape.id,
  winner: z.number().int().min(0).max(5).nullable(),
});

export const endExperiment: (input: {
  id: string;
  winner: number | null;
}) => Promise<StudioResult<{ id: string }>> = studioAction(
  "rec.weights",
  () => ({}),
  async ({ id, winner }, ctx) => {
    const cur = await ctx.db.from("rec_experiments").select("variants").eq("id", id).maybeSingle();
    if (cur.error) throw new Error(`recomendação: ${cur.error.message}`);
    if (!cur.data) throw new StudioFailure("not_found");
    const count = Array.isArray(cur.data.variants) ? cur.data.variants.length : 0;
    if (winner !== null && winner >= count) throw new StudioFailure("invalid", T.invalid);
    const { data, error } = await ctx.db
      .from("rec_experiments")
      .update({ status: "ended", ended_at: ctx.now().toISOString(), winner })
      .eq("id", id)
      .eq("status", "running")
      .select("id");
    if (error) throw new Error(`recomendação: ${error.message}`);
    if ((data ?? []).length === 0) throw new StudioFailure("conflict", T.wrongState);
    ctx.detail({ winner });
    return { id };
  },
  { schema: EndInput, objectRef: (i) => `rec_experiment:${i.id}` },
);

const PromoteInput = z.object({ id: IdInput.shape.id, justification: z.string().max(4000) });

/**
 * Promove a vencedora: não muda nada em vigor; copia os pesos da variante numa nova proposta e
 * pede a aprovação `rec.weights` dela (o banco confere que é proposta da própria pessoa e ainda
 * sem assinatura).
 */
export const promoteWinner: (input: {
  id: string;
  justification: string;
}) => Promise<StudioResult<{ version: string }>> = studioAction(
  "rec.weights",
  () => ({}),
  async ({ id, justification }, ctx) => {
    const why = normalizeJustification(justification);
    if (why === null) throw new StudioFailure("invalid", T.promoteNeedsJustification);
    const cur = await ctx.db
      .from("rec_experiments")
      .select("variants, winner, status")
      .eq("id", id)
      .maybeSingle();
    if (cur.error) throw new Error(`recomendação: ${cur.error.message}`);
    if (!cur.data) throw new StudioFailure("not_found");
    const variants = Array.isArray(cur.data.variants) ? cur.data.variants : [];
    const win = cur.data.winner === null ? undefined : variants[cur.data.winner];
    const version =
      win &&
      typeof win === "object" &&
      !Array.isArray(win) &&
      typeof win.weightsVersion === "string"
        ? win.weightsVersion
        : null;
    if (cur.data.status !== "ended" || version === null)
      throw new StudioFailure("conflict", T.wrongState);
    // Gate P5: versão aprovada não é reativada pelo pedido antigo (aprovação consumida). A
    // promoção copia os pesos vencedores numa NOVA proposta e pede a aprovação dela.
    const win2 = await ctx.db
      .from("rec_weights")
      .select("weights, cap, discovery_every, active")
      .eq("version", version)
      .maybeSingle();
    if (win2.error) throw new Error(`recomendação: ${win2.error.message}`);
    if (!win2.data) throw new StudioFailure("not_found");
    if (win2.data.active) throw new StudioFailure("conflict", T.wrongState);
    const copy = await insertProposal(
      ctx,
      win2.data.weights as unknown as Weights,
      Number(win2.data.cap),
      win2.data.discovery_every,
    );
    const r = await requestApproval({
      kind: "rec.weights",
      targetRef: copy,
      justification: `Promoção do teste ${id} (pesos ${version}): ${why}`,
    });
    if (!r.ok)
      throw new StudioFailure(r.error === "forbidden" ? "forbidden" : "invalid", r.message);
    ctx.detail({ version: copy, from: version, approval: r.value.id });
    return { version: copy };
  },
  { schema: PromoteInput, objectRef: (i) => `rec_experiment:${i.id}` },
);

/* ----------------------------------------------------------------- campanhas */

const CreateCampaignInput = z.object({
  name: z.string().trim().min(3, T.campNameRequired).max(120, T.campNameRequired),
  sourceSlugs: z
    .array(z.string().trim().min(1).max(80))
    .min(1, T.campSourcesRequired)
    .max(10, T.campSourcesRequired),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quotaPct: z.number().int().min(1).max(20),
  audience: z.enum(["todos", "anonimos", "contas"]),
});
export type CreateCampaignInput = z.infer<typeof CreateCampaignInput>;

export const createCampaign: (input: CreateCampaignInput) => Promise<StudioResult<{ id: string }>> =
  studioAction(
    "rec.weights",
    () => ({}),
    async (input, ctx) => {
      const days = (Date.parse(input.endsOn) - Date.parse(input.startsOn)) / 86_400_000;
      if (!(days >= 0 && days <= 90)) throw new StudioFailure("invalid", T.campDates);
      const slugs = [...new Set(input.sourceSlugs)];
      const known = await ctx.db
        .from("sources")
        .select("slug, status")
        .in("slug", slugs)
        .is("archived_at", null);
      if (known.error) throw new Error(`recomendação: ${known.error.message}`);
      const ok = new Set(
        (known.data ?? []).filter((s) => s.status !== "blocked").map((s) => s.slug),
      );
      const missing = slugs.find((s) => !ok.has(s));
      if (missing) throw new StudioFailure("invalid", T.campUnknownSource(missing));
      const { data, error } = await ctx.db
        .from("rec_campaigns")
        .insert({
          name: input.name,
          source_slugs: slugs,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
          quota_pct: input.quotaPct,
          audience: input.audience,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "42501") throw new StudioFailure("forbidden", T.forbidden);
        throw new Error(`recomendação: ${error.message}`);
      }
      ctx.setObjectRef(`rec_campaign:${data.id}`);
      return { id: data.id };
    },
    { schema: CreateCampaignInput, objectRef: () => "rec_campaign:nova" },
  );

const CampaignId = z.object({ id: z.string().uuid() });

export const endCampaign: (input: { id: string }) => Promise<StudioResult<{ id: string }>> =
  studioAction(
    "rec.weights",
    () => ({}),
    async ({ id }, ctx) => {
      const { data, error } = await ctx.db
        .from("rec_campaigns")
        .update({ ended_at: ctx.now().toISOString() })
        .eq("id", id)
        .is("ended_at", null)
        .select("id");
      if (error) throw new Error(`recomendação: ${error.message}`);
      if ((data ?? []).length === 0) throw new StudioFailure("not_found");
      return { id };
    },
    { schema: CampaignId, objectRef: (i) => `rec_campaign:${i.id}` },
  );
