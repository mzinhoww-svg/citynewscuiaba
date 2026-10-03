import { err, ok } from "@/lib/result";
import { parseForcedItemRef } from "@/lib/review/batches";
import type { Revalidate } from "../ports";
import { stepError, type StepHandler } from "../run-step";
import { articleTags } from "./publish";

/** O que o passo precisa do banco: a função `forced_publish_batch` (service role). */
export interface ForcedPublishDeps {
  runBatch: (
    jobId: string,
    batch: number,
  ) => Promise<{
    status: string;
    published: { id: string; slug: string; topicId: string | null; sectionSlug: string }[];
  }>;
  revalidate: Revalidate;
}

/**
 * Passo `forced_publish` (REV-T1): publica um lote de até 50 matérias do "Publicar mesmo assim".
 * A regra de publicação, a decisão humana `forced_publish` e os contadores do trabalho ficam na
 * função do banco (atômica e idempotente por lote); aqui só se invalida o cache. Falha do banco
 * tenta de novo; a mesma mensagem repetida não conta duas vezes.
 */
export function createForcedPublishStep(deps: ForcedPublishDeps): StepHandler {
  return async (msg) => {
    const ref = parseForcedItemRef(msg.itemRef);
    if (!ref) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const r = await deps.runBatch(ref.jobId, ref.batch);
    if (r.status === "not_found") return err(stepError.notFound(`lote ${msg.itemRef} não existe`));
    const tags = r.published.flatMap((p) =>
      articleTags({
        articleId: p.id,
        slug: p.slug,
        topicId: p.topicId,
        sectionSlug: p.sectionSlug,
      }),
    );
    if (tags.length > 0) await deps.revalidate([...new Set([...tags, "corrections"])]);
    return ok([]);
  };
}
