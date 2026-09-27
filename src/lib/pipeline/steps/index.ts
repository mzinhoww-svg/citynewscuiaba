import type { StepHandlers } from "../run-step";
import { createClusterStep } from "./cluster";
import { createDedupeStep, type UnderstandingDeps } from "./dedupe";
import { createExtractStep } from "./extract";
import { createFetchStep, type IngestDeps } from "./fetch";
import { createNormalizeStep } from "./normalize";
import { createValidateStep } from "./validate";

export type { IngestDeps } from "./fetch";
export type { UnderstandingDeps } from "./dedupe";
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
  };
}

/** Etapas 6 e 7: deduplicação e agrupamento em assuntos. */
export function createClusterHandlers(deps: UnderstandingDeps): StepHandlers {
  return { dedupe: createDedupeStep(deps), cluster: createClusterStep(deps) };
}
