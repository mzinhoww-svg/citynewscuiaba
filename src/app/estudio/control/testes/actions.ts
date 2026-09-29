"use server";

import type { PlaygroundReply } from "@/components";
import { AI_ADMIN_TEXT as T } from "@/content/pt-BR/control-ai";
import { playground } from "@/lib/ai/prompts";

/*
 * Playground: camada fina sobre `playground()` (papel, sanitização, orçamento e auditoria ficam
 * lá). Nada é publicado; a saída vai para a tela como texto.
 */
export async function runPlaygroundAction(input: {
  agentId: string;
  promptVersion: number;
  modelId: string;
  input: string;
}): Promise<PlaygroundReply> {
  try {
    const r = await playground(input);
    if (!r.ok) {
      return {
        ok: false,
        message: r.message,
        sanitizedInput: r.sanitizedInput,
        costBrl: r.costBrl,
        latencyMs: r.latencyMs,
      };
    }
    return {
      ok: true,
      provider: r.provider,
      sanitizedInput: r.value.sanitizedInput,
      output:
        typeof r.value.output === "string"
          ? r.value.output
          : JSON.stringify(r.value.output, null, 2),
      valid: r.value.valid,
      costBrl: r.value.costBrl,
      latencyMs: r.value.latencyMs,
    };
  } catch (e) {
    console.error("estudio playground:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      message: T.playgroundError.provider,
      sanitizedInput: null,
      costBrl: 0,
      latencyMs: 0,
    };
  }
}
