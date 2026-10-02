import { err, ok } from "@/lib/result";
import { tryCanonicalUrl } from "../canonical-url";
import type { IngestRepo } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";

const REF = /^raw:([^#]+)#(\d+)$/;

/**
 * Etapa 5: item extraído → `collected_items` (único por URL canônica). Item com instrução
 * embutida vai para a quarentena com alerta de segurança e nunca vira item coletado.
 */
export function createNormalizeStep(deps: { repo: IngestRepo }): StepHandler {
  return async (msg) => {
    const m = REF.exec(msg.itemRef);
    const rawId = m?.[1];
    const index = Number(m?.[2]);
    if (!rawId || !Number.isInteger(index))
      return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const raw = await deps.repo.rawItem(rawId);
    const entry = raw?.entries?.[index];
    if (!raw || !entry) return err(stepError.notFound(`item ${msg.itemRef} não encontrado`));

    if (entry.injection)
      return err(
        stepError.injection("instrução embutida em texto externo", {
          url: entry.url,
          matches: entry.injectionMatches,
          sourceId: raw.sourceId,
        }),
      );

    const canonical = tryCanonicalUrl(entry.url);
    if (!canonical) return err(stepError.invalid(`URL inválida: ${entry.url}`));
    const source = await deps.repo.sourceById(raw.sourceId);
    if (!source) return err(stepError.notFound(`fonte ${raw.sourceId} não encontrada`));

    const { id, created, pending } = await deps.repo.insertCollectedItem({
      rawId,
      sourceId: raw.sourceId,
      canonicalUrl: canonical,
      originalTitle: entry.title,
      excerpt: entry.excerpt,
      author: entry.author,
      publishedAt: entry.publishedAt,
      imageUrl: entry.imageUrl,
      locality: source.locality,
    });
    // Saúde da fonte (`source_health_daily.items_new`): só item de fato novo.
    if (created) await deps.repo.recordFetch(raw.sourceId, "items", null, 1, null);
    // Item novo, ou que já existia e ainda não avançou (retomada depois de queda): segue.
    return ok(created || pending ? [nextMessage(msg, "dedupe", `item:${id}`)] : []);
  };
}
