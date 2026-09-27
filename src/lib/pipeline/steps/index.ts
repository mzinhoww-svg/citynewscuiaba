import type { StepHandlers } from "../run-step";
import { createClassifyStep, type UnderstandStepDeps } from "./classify";
import { createClusterStep } from "./cluster";
import { createDedupeStep, type UnderstandingDeps } from "./dedupe";
import { createExtractStep } from "./extract";
import { createLocateStep } from "./locate";
import { createFetchStep, type IngestDeps } from "./fetch";
import { createNormalizeStep } from "./normalize";
import { createValidateStep } from "./validate";
import { createVerifyStep } from "./verify";

export type { IngestDeps } from "./fetch";
export type { UnderstandingDeps } from "./dedupe";
export type { UnderstandStepDeps } from "./classify";
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
