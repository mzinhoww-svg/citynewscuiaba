import type { CallAgent } from "@/lib/ai/call-agent";
import { ClassifySchema, type Classification } from "@/lib/ai/schemas/classify";
import { err, ok } from "@/lib/result";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import type { UnderstandRepo } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { aiStepError, INJECTION_MESSAGE, inputHash, itemIdFrom, itemText } from "./understanding";

export interface UnderstandStepDeps {
  repo: UnderstandRepo;
  callAgent: CallAgent;
  /** Versão do prompt em produção do agente (idempotência por versão). */
  promptVersion: (agentId: string) => Promise<number | null>;
  now: () => Date;
}

const TASK =
  "Classifique o item coletado: editoria, relevância para Cuiabá e Várzea Grande (0 a 1), se o tema é sensível e até 8 etiquetas curtas.";

/**
 * Etapa 8: editoria, relevância e sensibilidade pelo agente `classify`. O texto é conferido antes
 * de qualquer modelo: instrução embutida tira o item do fluxo (quarentena + alerta de segurança).
 * Idempotente por (item, versão do prompt, texto).
 */
export function createClassifyStep(deps: UnderstandStepDeps): StepHandler {
  return async (msg) => {
    const id = itemIdFrom(msg.itemRef);
    if (!id) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const item = await deps.repo.understandItem(id);
    if (!item) return err(stepError.notFound(`item ${id} não encontrado`));
    if (item.duplicateOf || item.quarantined) return ok([]);

    const clean = sanitizeExternalText(itemText(item));
    if (clean.injection) {
      await deps.repo.quarantineItem(id, `${INJECTION_MESSAGE}: ${clean.matches.join("; ")}`);
      return err(
        stepError.injection(INJECTION_MESSAGE, {
          itemId: id,
          sourceId: item.sourceId,
          matches: clean.matches,
        }),
      );
    }

    const version = await deps.promptVersion("classify");
    const hash = inputHash("classify", version, clean.text);
    const objectRef = `item:${id}`;
    const prior = await deps.repo.findDecision(objectRef, "classify", hash);
    const reused = prior ? ClassifySchema.safeParse(prior.output) : null;
    let out: Classification;
    if (reused?.success) out = reused.data;
    else {
      const r = await deps.callAgent(
        "classify",
        { system: "", data: [{ id: objectRef, text: clean.text }], task: TASK },
        ClassifySchema,
      );
      if (!r.ok) {
        if (r.error === "injection")
          await deps.repo.quarantineItem(id, `${INJECTION_MESSAGE} (detectada na chamada de IA)`);
        return err(aiStepError(r.error, "classificação", { itemId: id }));
      }
      out = r.value;
      await deps.repo.recordDecision({
        objectRef,
        step: "classify",
        agentId: "classify",
        promptVersion: version,
        inputHash: hash,
        output: out,
        rationale: null,
      });
    }
    await deps.repo.updateItem(id, {
      sectionSlug: out.section,
      relevance: out.relevance,
      sensitive: out.sensitive,
      tags: out.tags,
    });
    return ok([nextMessage(msg, "locate", msg.itemRef)]);
  };
}
