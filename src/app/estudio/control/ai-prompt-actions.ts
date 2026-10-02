"use server";

import {
  AGENTS_TEXT,
  MODELS_TEXT,
  PLAYGROUND_TEXT,
  PROMPTS_TEXT,
} from "@/content/pt-BR/ai-prompts";
import type { PlaygroundReply, PromptReply } from "@/components/estudio";
import type { StudioResult } from "@/lib/studio/action";
import {
  createPromptVersionCommand,
  playgroundCommand,
  publishPromptCommand,
  requestPromptPublishCommand,
  rollbackPromptCommand,
  updateAgentCommand,
  updateModelCommand,
  type AgentUpdateInput,
  type CreatePromptInput,
  type ModelUpdateInput,
  type PlaygroundCommandInput,
  type PublishPromptInput,
  type RequestPublishInput,
  type RollbackPromptInput,
} from "@/lib/studio/ai-prompts";

/* Server Actions de agentes, modelos, prompts e playground (P5-T5): camada fina sobre os comandos. */

function reply<O>(
  r: StudioResult<O>,
  success: (v: O) => string,
  texts: { forbidden: string; genericError: string },
): PromptReply {
  if (r.ok) return { ok: true, message: success(r.value) };
  if (r.message) return { ok: false, message: r.message };
  return { ok: false, message: r.error === "forbidden" ? texts.forbidden : texts.genericError };
}

/* As ações recebem `agentId: string` da tela; o schema zod de cada comando valida em tempo de execução. */
type Loose<T> = Omit<T, "agentId" | "id"> & { agentId?: string; id?: string };

export async function createPromptVersionAction(i: Loose<CreatePromptInput>): Promise<PromptReply> {
  return reply(
    await createPromptVersionCommand(i as CreatePromptInput),
    (v) => PROMPTS_TEXT.created(v.version),
    PROMPTS_TEXT,
  );
}

export async function requestPromptPublishAction(
  i: Loose<RequestPublishInput>,
): Promise<PromptReply> {
  return reply(
    await requestPromptPublishCommand(i as RequestPublishInput),
    () => PROMPTS_TEXT.requested,
    PROMPTS_TEXT,
  );
}

export async function publishPromptAction(i: PublishPromptInput): Promise<PromptReply> {
  return reply(
    await publishPromptCommand(i),
    (v) => PROMPTS_TEXT.published(v.version),
    PROMPTS_TEXT,
  );
}

export async function rollbackPromptAction(i: Loose<RollbackPromptInput>): Promise<PromptReply> {
  return reply(
    await rollbackPromptCommand(i as RollbackPromptInput),
    (v) => PROMPTS_TEXT.rolledBack(v.to, v.version),
    PROMPTS_TEXT,
  );
}

export async function updateAgentAction(i: Loose<AgentUpdateInput>): Promise<PromptReply> {
  return reply(await updateAgentCommand(i as AgentUpdateInput), () => AGENTS_TEXT.saved, {
    forbidden: AGENTS_TEXT.readOnly,
    genericError: PROMPTS_TEXT.genericError,
  });
}

export async function updateModelAction(i: ModelUpdateInput): Promise<PromptReply> {
  return reply(await updateModelCommand(i), () => MODELS_TEXT.updated, {
    forbidden: MODELS_TEXT.readOnly,
    genericError: PROMPTS_TEXT.genericError,
  });
}

export async function playgroundAction(i: Loose<PlaygroundCommandInput>): Promise<PlaygroundReply> {
  const r = await playgroundCommand(i as PlaygroundCommandInput);
  if (!r.ok) {
    if (r.message) return { ok: false, message: r.message };
    return {
      ok: false,
      message: r.error === "forbidden" ? PLAYGROUND_TEXT.forbidden : PLAYGROUND_TEXT.genericError,
    };
  }
  return {
    ok: true,
    message: r.value.valid ? PLAYGROUND_TEXT.valid : PLAYGROUND_TEXT.invalid,
    result: {
      sanitizedInput: r.value.sanitizedInput,
      output: r.value.output,
      valid: r.value.valid,
      error: r.value.error,
      costBrl: r.value.costBrl,
      latencyMs: r.value.latencyMs,
      providerKind: r.value.providerKind,
      promptVersion: r.value.promptVersion,
      modelId: r.value.modelId,
    },
  };
}
