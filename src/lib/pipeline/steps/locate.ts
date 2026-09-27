import { LocateSchema } from "@/lib/ai/schemas/locate";
import { findPlace, resolveNeighborhood, type Locality } from "@/lib/geo/neighborhoods";
import { err, ok } from "@/lib/result";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import type { UnderstandStepDeps } from "./classify";
import { aiStepError, INJECTION_MESSAGE, inputHash, itemIdFrom, itemText } from "./understanding";

const TASK =
  "Diga em que município e bairro acontece o fato do item. Use só o que o texto diz; sem bairro citado, neighborhood=null.";

/**
 * Etapa 9: município e bairro. Primeiro o dicionário (`src/lib/geo`); sem bairro, o agente
 * `locate`, cuja resposta só vale se o bairro existir no dicionário. Sem resposta útil, fica a
 * localidade da fonte: localização nunca trava o item.
 */
export function createLocateStep(deps: UnderstandStepDeps): StepHandler {
  return async (msg, ctx) => {
    const id = itemIdFrom(msg.itemRef);
    if (!id) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const item = await deps.repo.understandItem(id);
    if (!item) return err(stepError.notFound(`item ${id} não encontrado`));
    if (item.duplicateOf || item.quarantined) return ok([]);

    const text = sanitizeExternalText(itemText(item)).text;
    const place = findPlace(text);
    let municipality: Locality | null = place.municipality;
    let neighborhood = place.neighborhood;

    if (!neighborhood) {
      const version = await deps.promptVersion("locate");
      const hash = inputHash("locate", version, text);
      const objectRef = `item:${id}`;
      const prior = await deps.repo.findDecision(objectRef, "locate", hash);
      const reused = prior ? LocateSchema.safeParse(prior.output) : null;
      let answer = reused?.success ? reused.data : null;
      if (!answer) {
        const r = await deps.callAgent(
          "locate",
          { system: "", data: [{ id: objectRef, text }], task: TASK },
          LocateSchema,
          { signal: ctx?.signal },
        );
        if (!r.ok && r.error === "injection") {
          await deps.repo.quarantineItem(id, `${INJECTION_MESSAGE} (detectada na chamada de IA)`);
          return err(aiStepError(r.error, "localização", { itemId: id }));
        }
        if (r.ok) {
          answer = r.value;
          await deps.repo.recordDecision({
            objectRef,
            step: "locate",
            agentId: "locate",
            promptVersion: version,
            inputHash: hash,
            output: answer,
            rationale: null,
          });
        }
      }
      if (answer) {
        const resolved = answer.neighborhood ? resolveNeighborhood(answer.neighborhood) : null;
        const fits = (m: Locality | null) => m === null || m === resolved?.municipality;
        if (resolved && fits(municipality) && fits(answer.municipality)) {
          neighborhood = resolved;
          municipality = resolved.municipality;
        }
        municipality ??= answer.municipality;
      }
    }

    await deps.repo.updateItem(id, {
      locality: municipality ?? item.sourceLocality,
      neighborhood: neighborhood?.name ?? null,
    });
    return ok(item.topicId ? [nextMessage(msg, "verify", `topic:${item.topicId}`)] : []);
  };
}
