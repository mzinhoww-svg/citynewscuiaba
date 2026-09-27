import { err, ok } from "@/lib/result";
import type { ClusterRepo, Embed } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { hamming, simhash64 } from "../simhash";
import { itemIdFrom, itemText, windowSince } from "./understanding";

export const DEDUPE_MAX_HAMMING = 3;
export const DEDUPE_MIN_COSINE = 0.9;
const CANDIDATES = 20;

/** Duplicado: simhash a distância ≤ 3 ou cosseno ≥ 0,90 (arquitetura §4). */
export function isDuplicate(a: bigint, b: bigint, cos?: number): boolean {
  if (hamming(a, b) <= DEDUPE_MAX_HAMMING) return true;
  return cos !== undefined && Number.isFinite(cos) && cos >= DEDUPE_MIN_COSINE;
}

export interface UnderstandingDeps {
  repo: ClusterRepo;
  embed: Embed;
  now: () => Date;
}

/**
 * Etapa 6: calcula simhash e embedding (uma vez só por item) e procura o original entre os itens
 * das últimas 72 h. Duplicado herda o assunto do original e para aqui; novo segue para `cluster`.
 */
export function createDedupeStep(deps: UnderstandingDeps): StepHandler {
  return async (msg) => {
    const id = itemIdFrom(msg.itemRef);
    if (!id) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const item = await deps.repo.collectedItem(id);
    if (!item) return err(stepError.notFound(`item ${id} não encontrado`));
    if (item.duplicateOf) return ok([]);

    let simhash = item.simhash;
    if (simhash === null || item.embedding === null) {
      let embedding = item.embedding;
      if (!embedding) {
        const e = await deps.embed(itemText(item));
        if (!e.ok) return err(stepError.transient(`embedding indisponível: ${e.error}`));
        embedding = e.value;
      }
      simhash = simhash64(item.title);
      await deps.repo.saveFingerprint(id, { simhash, embedding });
    }

    const candidates = await deps.repo.dedupeCandidates(id, {
      simhash,
      since: windowSince(deps.now()),
      maxHamming: DEDUPE_MAX_HAMMING,
      minCosine: DEDUPE_MIN_COSINE,
      limit: CANDIDATES,
    });
    const original = candidates.find((c) => isDuplicate(simhash, c.simhash, c.cosine ?? undefined));
    if (original) {
      await deps.repo.markDuplicate(id, original.id);
      return ok([]);
    }
    return ok([nextMessage(msg, "cluster", msg.itemRef)]);
  };
}
