"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PromptEditorReply } from "@/components";
import { AI_ADMIN_TEXT as T } from "@/content/pt-BR/control-ai";
import {
  createPromptVersion,
  proposePrompt,
  publishPrompt,
  requestPromptPublication,
  rollbackPrompt,
} from "@/lib/ai/prompts";
import { studioContext } from "@/lib/studio/context";

/*
 * Server Actions da tela de prompts: camada fina sobre src/lib/ai/prompts (papel, validação,
 * aprovação dupla e auditoria ficam lá). Devolvem texto pronto ou voltam à tela com o resultado.
 */
const back = (agentId: string) => `/estudio/control/prompts/${encodeURIComponent(agentId)}`;
const text = (f: FormData, k: string) => String(f.get(k) ?? "");

function touch(agentId: string) {
  revalidatePath(back(agentId));
  revalidatePath("/estudio/control/aprovacoes");
  revalidatePath("/estudio/control/agentes");
}

/** Editor: salva como rascunho ou salva e propõe a publicação. */
export async function savePromptAction(
  agentId: string,
  input: { body: string; rationale: string; propose: boolean },
): Promise<PromptEditorReply> {
  if (input.propose) {
    const r = await proposePrompt({ agentId, body: input.body, rationale: input.rationale });
    if (!r.ok) return { ok: false, message: r.message };
    touch(agentId);
    return { ok: true, message: T.proposed(r.value.version) };
  }
  const r = await createPromptVersion({
    agentId,
    body: input.body,
    rationale: input.rationale,
  });
  if (!r.ok) return { ok: false, message: r.message ?? T.forbidden };
  touch(agentId);
  return { ok: true, message: T.draftSaved(r.value.version) };
}

/** Histórico: propõe a publicação de um rascunho já salvo (a justificativa é a da versão). */
export async function requestPublicationAction(formData: FormData): Promise<void> {
  const agentId = text(formData, "agentId");
  const id = text(formData, "id");
  const ctx = await studioContext();
  const row = await ctx.db
    .from("ai_prompts")
    .select("rationale, version")
    .eq("id", id)
    .maybeSingle();
  const r = await requestPromptPublication({ id, justification: row.data?.rationale ?? "" });
  touch(agentId);
  if (r.ok) redirect(`${back(agentId)}?ok=proposta&versao=${row.data?.version ?? ""}`);
  redirect(`${back(agentId)}?erro=${r.error}`);
}

/** Histórico: quem decide aprova e publica a versão pendente de outra pessoa. */
export async function approvePublishAction(formData: FormData): Promise<void> {
  const agentId = text(formData, "agentId");
  const r = await publishPrompt({ id: text(formData, "id") });
  touch(agentId);
  if (r.ok) redirect(`${back(agentId)}?ok=publicada&versao=${text(formData, "version")}`);
  redirect(`${back(agentId)}?erro=${r.error}`);
}

/** Histórico: rollback como nova versão, com justificativa, que segue para aprovação. */
export async function rollbackAction(formData: FormData): Promise<void> {
  const agentId = text(formData, "agentId");
  const toVersion = Number(text(formData, "toVersion"));
  const r = await rollbackPrompt({
    agentId,
    toVersion,
    justification: text(formData, "justification"),
  });
  touch(agentId);
  if (r.ok) redirect(`${back(agentId)}?ok=rollback&versao=${r.value.version}&de=${toVersion}`);
  redirect(`${back(agentId)}?erro=${r.error}`);
}
