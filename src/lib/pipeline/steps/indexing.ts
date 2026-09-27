import { err, ok } from "@/lib/result";
import { stepError, type StepHandler } from "../run-step";
import { articleIdFrom } from "./decide";
import { articleTags } from "./publish";
import type { PublishStepDeps } from "./write";

/**
 * Etapa 19 (indexar): FTS (título, linha fina e corpo) e embedding da matéria publicada, depois
 * `revalidateTag` das páginas afetadas. Sem embedding (IA fora), indexa o texto mesmo assim.
 * Arquivo `indexing.ts` porque `steps/index.ts` é o índice do módulo.
 */
export function createIndexStep(deps: PublishStepDeps): StepHandler {
  return async (msg) => {
    const articleId = articleIdFrom(msg.itemRef);
    if (!articleId) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const ctx = await deps.repo.decisionContext(articleId);
    if (!ctx) return err(stepError.notFound(`matéria ${articleId} não encontrada`));
    if (ctx.status !== "published" && ctx.status !== "updated") return ok([]);

    const text = await deps.repo.articleText(articleId);
    const vector = text ? await deps.embed(text) : null;
    await deps.repo.indexArticle(articleId, vector?.ok ? vector.value : null);
    await deps.revalidate(articleTags(ctx));
    return ok([]);
  };
}
