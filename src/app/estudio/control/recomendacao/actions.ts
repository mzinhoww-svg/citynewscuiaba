"use server";

import { revalidatePath } from "next/cache";
import { REC_TEXT as T } from "@/content/pt-BR/control-rec";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { audit } from "@/lib/audit";
import { explainForAnon, type WhyResult } from "@/lib/db/queries/recommendation";
import {
  createCampaign,
  createExperiment,
  endCampaign,
  endExperiment,
  promoteWinner,
  proposeWeights,
  startExperiment,
  type CreateCampaignInput,
  type CreateExperimentInput,
  type ProposeWeightsInput,
} from "@/lib/studio/recommendation";
import type { StudioResult } from "@/lib/studio/action";

/*
 * Server Actions das telas O17/O18: camada fina sobre src/lib/studio/recommendation (papel,
 * validação e auditoria ficam lá). Devolvem `{ ok, message }` pronto para a região de status.
 */

export type RecReply<T = undefined> =
  | ({ ok: true; message: string } & (T extends undefined ? object : { value: T }))
  | { ok: false; message: string };

function failText(r: Extract<StudioResult<unknown>, { ok: false }>): string {
  if (r.message) return r.message;
  return r.error === "forbidden" ? T.forbidden : T.invalid;
}

const revalidate = (id?: string) => {
  revalidatePath("/estudio/control/recomendacao");
  revalidatePath("/estudio/control/aprovacoes");
  if (id) revalidatePath(`/estudio/control/recomendacao/testes/${id}`);
};

export async function proposeWeightsAction(input: ProposeWeightsInput): Promise<RecReply> {
  const r = await proposeWeights(input);
  if (!r.ok) return { ok: false, message: failText(r) };
  revalidate();
  return { ok: true, message: T.proposedOk(r.value.version) };
}

export async function createCampaignAction(input: CreateCampaignInput): Promise<RecReply> {
  const r = await createCampaign(input);
  if (!r.ok) return { ok: false, message: failText(r) };
  revalidate();
  return { ok: true, message: T.campCreated };
}

export async function endCampaignAction(input: { id: string }): Promise<RecReply> {
  const r = await endCampaign(input);
  if (!r.ok) return { ok: false, message: failText(r) };
  revalidate();
  return { ok: true, message: T.campEndedOk };
}

export async function createExperimentAction(
  input: CreateExperimentInput,
): Promise<RecReply<{ id: string }>> {
  const r = await createExperiment(input);
  if (!r.ok) return { ok: false, message: failText(r) };
  revalidate();
  return { ok: true, message: T.testCreated, value: { id: r.value.id } };
}

export async function startExperimentAction(input: { id: string }): Promise<RecReply> {
  const r = await startExperiment(input);
  if (!r.ok) return { ok: false, message: failText(r) };
  revalidate(input.id);
  return { ok: true, message: T.startedOk };
}

export async function endExperimentAction(input: {
  id: string;
  winner: number | null;
}): Promise<RecReply> {
  const r = await endExperiment(input);
  if (!r.ok) return { ok: false, message: failText(r) };
  revalidate(input.id);
  return { ok: true, message: T.endedOk };
}

export async function promoteWinnerAction(input: {
  id: string;
  justification: string;
}): Promise<RecReply> {
  const r = await promoteWinner(input);
  if (!r.ok) return { ok: false, message: failText(r) };
  revalidate(input.id);
  return { ok: true, message: T.promotedOk(r.value.version) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Por que esta recomendação": consulta por id anônimo. Só leitura, exige `metrics.view`; o id
 * nunca volta à tela nem vai para o log (a auditoria guarda o apelido).
 */
export async function explainAction(anonId: string): Promise<RecReply<WhyResult>> {
  const session = await getSession();
  if (!session || !canAccess(session.roles, "metrics.view"))
    return { ok: false, message: T.whyForbidden };
  const id = String(anonId ?? "").trim();
  if (!UUID.test(id)) return { ok: false, message: T.whyInvalid };
  try {
    const result = await explainForAnon(id.toLowerCase());
    await audit(session.userId, "metrics.view", `rec_explain:${result.alias}`, {
      personalization: result.personalization,
    });
    return { ok: true, message: T.whyResultTitle(result.alias), value: result };
  } catch (e) {
    console.error("estudio recomendação (explicar):", e instanceof Error ? e.message : e);
    return { ok: false, message: T.whyError };
  }
}
