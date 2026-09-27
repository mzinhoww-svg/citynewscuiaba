import {
  AggregateSummarySchema,
  COPY_RUN_WORDS,
  copiedRun,
} from "@/lib/ai/schemas/aggregate-summary";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import type { UnderstandItem } from "../ports";
import type { UnderstandStepDeps } from "./classify";
import { inputHash } from "./understanding";

export type AggregateSummaryOutcome =
  | "not_allowed" // política da fonte, tema sensível, sem texto da fonte ou já resumido
  | "saved"
  | "reused"
  | "discarded" // cópia da fonte: descartado com motivo
  | "failed"; // IA indisponível: sem resumo, o card mostra só título, data e link

const AGENT = "aggregate_summary";
const TASK = `Escreva, com palavras próprias, um resumo de até 2 frases (máximo de 280 caracteres) do item. Nenhuma frase pode repetir ${COPY_RUN_WORDS} palavras seguidas do texto da fonte.`;

/**
 * Resumo próprio do item agregado (spec D10; CLAUDE.md regra 4). Só para fonte com política
 * `summary_2_sentences`, item com texto da fonte e tema não sensível. O texto da fonte
 * (`excerpt`) é só entrada do modelo, envelopado como dado; o resumo passa pelo schema (até 2
 * frases e 280 caracteres) e é descartado se alguma frase copiar 8 palavras seguidas do excerpt.
 * Idempotente por (item, versão do prompt, texto) e dentro do orçamento do agente. Falha de IA
 * nunca trava a classificação.
 */
export function createAggregateSummary(deps: UnderstandStepDeps) {
  return async (
    item: UnderstandItem,
    opts: { sensitive: boolean; signal?: AbortSignal },
  ): Promise<AggregateSummaryOutcome> => {
    if (item.republishPolicy !== "summary_2_sentences" || opts.sensitive) return "not_allowed";
    if (item.summary || !item.excerpt?.trim()) return "not_allowed";

    const source = sanitizeExternalText(item.excerpt).text;
    const text = sanitizeExternalText(`${item.title}\n${item.excerpt}`).text;
    const version = await deps.promptVersion(AGENT);
    const hash = inputHash(AGENT, version, text);
    const objectRef = `item:${item.id}`;

    const prior = await deps.repo.findDecision(objectRef, "summarize", hash);
    if (prior) {
      const reused = AggregateSummarySchema.safeParse(prior.output);
      if (prior.output.accepted !== true || !reused.success) return "discarded";
      await deps.repo.saveItemSummary(item.id, reused.data.summary);
      return "reused";
    }

    const r = await deps.callAgent(
      AGENT,
      { system: "", data: [{ id: objectRef, text }], task: TASK },
      AggregateSummarySchema,
      { signal: opts.signal },
    );
    if (!r.ok) return "failed";

    const copied = copiedRun(r.value.summary, source);
    await deps.repo.recordDecision({
      objectRef,
      step: "summarize",
      agentId: AGENT,
      promptVersion: version,
      inputHash: hash,
      output: copied ? { accepted: false, copied } : { accepted: true, summary: r.value.summary },
      rationale: copied
        ? `Resumo descartado: copia ${COPY_RUN_WORDS} palavras seguidas do texto da fonte ("${copied}").`
        : "Resumo próprio de até 2 frases (política summary_2_sentences).",
    });
    if (copied) return "discarded";
    await deps.repo.saveItemSummary(item.id, r.value.summary);
    return "saved";
  };
}
