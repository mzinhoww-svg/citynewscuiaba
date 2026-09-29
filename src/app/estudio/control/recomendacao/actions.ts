"use server";

import type { RecReply, WhyReply } from "@/components";
import { AB_TEXT, REC_TEXT } from "@/content/pt-BR/recommendation-admin";
import type { StudioResult } from "@/lib/studio/action";
import {
  activateWeightsCommand,
  createCampaignCommand,
  createExperimentCommand,
  endExperimentCommand,
  explainRecommendationCommand,
  promoteExperimentCommand,
  proposeWeightsCommand,
  type ActivateWeightsInput,
  type CampaignInput,
  type ExperimentInput,
  type ExplainInput,
  type PromoteInput,
  type ProposeWeightsInput,
} from "@/lib/studio/recommendation";

/* Server Actions do painel de recomendação e dos testes A/B (P5-T7). */

function reply<O>(r: StudioResult<O>, success: (v: O) => string): RecReply {
  if (r.ok) return { ok: true, message: success(r.value) };
  if (r.message) return { ok: false, message: r.message };
  return { ok: false, message: r.error === "forbidden" ? AB_TEXT.forbidden : AB_TEXT.genericError };
}

export async function proposeWeightsAction(i: ProposeWeightsInput): Promise<RecReply> {
  return reply(await proposeWeightsCommand(i), (v) => REC_TEXT.proposed(v.version));
}

export async function activateWeightsAction(i: ActivateWeightsInput): Promise<RecReply> {
  return reply(await activateWeightsCommand(i), (v) => REC_TEXT.activated(v.version));
}

/* A tela manda `audience: string`; o schema zod do comando valida. */
export async function createCampaignAction(
  i: Omit<CampaignInput, "audience"> & { audience: string },
): Promise<RecReply> {
  return reply(await createCampaignCommand(i as CampaignInput), () =>
    REC_TEXT.campaignCreated(i.name),
  );
}

export async function createExperimentAction(i: ExperimentInput): Promise<RecReply> {
  return reply(await createExperimentCommand(i), () => REC_TEXT.experimentCreated(i.name));
}

export async function endExperimentAction(i: { id: string }): Promise<RecReply> {
  return reply(await endExperimentCommand(i), () => AB_TEXT.ended_);
}

export async function promoteExperimentAction(i: PromoteInput): Promise<RecReply> {
  return reply(await promoteExperimentCommand(i), (v) => AB_TEXT.promoted(v.version));
}

export async function explainRecommendationAction(i: ExplainInput): Promise<WhyReply> {
  const r = await explainRecommendationCommand(i);
  if (!r.ok) {
    if (r.message) return { ok: false, message: r.message };
    return {
      ok: false,
      message: r.error === "forbidden" ? AB_TEXT.forbidden : AB_TEXT.genericError,
    };
  }
  return {
    ok: true,
    message: "",
    result: {
      pseudonym: r.value.pseudonym,
      personalization: r.value.personalization,
      version: r.value.version,
      sources: r.value.sources.map((s) => ({
        slug: s.slug,
        name: s.name,
        score: s.score,
        reason: s.reason,
        components: s.components,
      })),
    },
  };
}
