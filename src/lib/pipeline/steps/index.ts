import type { StepHandlers } from "../run-step";
import { createClassifyStep, type UnderstandStepDeps } from "./classify";
import { createClusterStep } from "./cluster";
import { createDedupeStep, type UnderstandingDeps } from "./dedupe";
import { createEnrichStep } from "./enrich";
import { createExtractStep } from "./extract";
import { createLocateStep } from "./locate";
import { createDecideStep } from "./decide";
import { createIndexStep } from "./indexing";
import { createMediaStep, type MediaStepDeps } from "./media";
import { createNotifyStep } from "./notify";
import { createPublishStep } from "./publish";
import { createWriteStep, type PublishStepDeps } from "./write";
import { createFetchStep, type IngestDeps } from "./fetch";
import { createNormalizeStep } from "./normalize";
import { createValidateStep } from "./validate";
import { createVerifyStep } from "./verify";

export type { IngestDeps } from "./fetch";
export type { UnderstandingDeps } from "./dedupe";
export type { UnderstandStepDeps } from "./classify";
export type { MediaStepDeps } from "./media";
export { imageLabel, REPRODUCTION_LICENSE } from "./media";
export type { PublishStepDeps } from "./write";
export { toDoc } from "./write";
export { routeArticle, candidateOf, isBreaking, notifyKindFor } from "./decide";
export { articleTags } from "./publish";
export { NOTIFY_DEDUPE_SEC, NOTIFY_KINDS } from "./notify";
export { confirmConflict, createVerifyTopic, extractNumbers, type VerifyResult } from "./verify";
export { isDuplicate } from "./dedupe";
export { assignTopic } from "./cluster";
export { detectFormat, extractFromFeed, extractFromJsonFeed, extractFromPage } from "./extract";

/** Fase de Coleta (etapas 2 a 5). */
export function createIngestHandlers(deps: IngestDeps): StepHandlers {
  return {
    fetch: createFetchStep(deps),
    validate: createValidateStep(deps),
    extract: createExtractStep(deps),
    normalize: createNormalizeStep(deps),
    // Passo opcional (fora das 20 etapas): só recebe item de fonte com `consumption.enrich`.
    enrich: createEnrichStep(deps),
  };
}

/** Etapas 6 e 7: deduplicação e agrupamento em assuntos. */
export function createClusterHandlers(deps: UnderstandingDeps): StepHandlers {
  return { dedupe: createDedupeStep(deps), cluster: createClusterStep(deps) };
}

/** Etapas 8 a 10: classificação, localidade e verificação de fontes. */
export function createUnderstandHandlers(deps: UnderstandStepDeps): StepHandlers {
  return {
    classify: createClassifyStep(deps),
    locate: createLocateStep(deps),
    verify: createVerifyStep(deps),
  };
}

/** Etapas 13 e 14: imagem e direitos da imagem (fila `media`). */
export function createMediaHandlers(deps: MediaStepDeps): StepHandlers {
  return { image: createMediaStep(deps) };
}

/** Etapas 11 a 20: redação, regras, publicação, índice e notificação. */
export function createPublishHandlers(deps: PublishStepDeps): StepHandlers {
  return {
    summarize: createWriteStep(deps),
    rules: createDecideStep(deps),
    publish: createPublishStep(deps),
    index: createIndexStep(deps),
    notify: createNotifyStep(deps),
  };
}
