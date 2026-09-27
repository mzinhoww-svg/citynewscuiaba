import { err, ok } from "@/lib/result";
import type { TopicCandidate } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { slugify } from "../slug";
import { cosine } from "../vector";
import type { UnderstandingDeps } from "./dedupe";
import { itemIdFrom, TOPIC_WINDOW_HOURS, windowSince } from "./understanding";

export const CLUSTER_MIN_COSINE = 0.82;
const CANDIDATES = 10;

/**
 * Assunto do item: o centróide mais próximo entre os assuntos atualizados nas últimas 72 h, se o
 * cosseno for ≥ 0,82. `similarity` é o melhor cosseno encontrado na janela (0 sem candidatos).
 */
export function assignTopic(
  item: { embedding: readonly number[] },
  candidates: readonly TopicCandidate[],
  now: Date,
): { topicId: string | null; similarity: number } {
  const limit = now.getTime() - TOPIC_WINDOW_HOURS * 3600_000;
  let best: { topicId: string; similarity: number } | null = null;
  for (const c of candidates) {
    const at = Date.parse(c.updatedAt);
    if (!Number.isFinite(at) || at < limit) continue;
    const s = cosine(item.embedding, c.centroid);
    if (!Number.isFinite(s)) continue;
    if (!best || s > best.similarity) best = { topicId: c.topicId, similarity: s };
  }
  if (!best) return { topicId: null, similarity: 0 };
  const similarity = Math.round(best.similarity * 1e4) / 1e4;
  return { topicId: similarity >= CLUSTER_MIN_COSINE ? best.topicId : null, similarity };
}

/** Etapa 7: item novo → assunto existente (centróide atualizado) ou assunto novo. */
export function createClusterStep(deps: UnderstandingDeps): StepHandler {
  return async (msg) => {
    const id = itemIdFrom(msg.itemRef);
    if (!id) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const item = await deps.repo.collectedItem(id);
    if (!item) return err(stepError.notFound(`item ${id} não encontrado`));
    if (item.duplicateOf) return ok([]);
    const next = [nextMessage(msg, "classify", msg.itemRef)];
    if (item.topicId) return ok(next);
    if (!item.embedding) return err(stepError.invalid(`item ${id} sem embedding: rode dedupe`));

    const now = deps.now();
    const candidates = await deps.repo.topicCandidates(id, {
      since: windowSince(now),
      limit: CANDIDATES,
    });
    const { topicId } = assignTopic({ embedding: item.embedding }, candidates, now);
    if (topicId) await deps.repo.attachToTopic(id, topicId, now);
    else
      await deps.repo.createTopic(
        id,
        {
          slug: `${slugify(item.title, 70)}-${id.replace(/-/g, "").slice(0, 8)}`,
          title: item.title,
        },
        now,
      );
    return ok(next);
  };
}
