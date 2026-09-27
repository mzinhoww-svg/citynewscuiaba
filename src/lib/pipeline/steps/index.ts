import type { StepHandlers } from "../run-step";
import { createExtractStep } from "./extract";
import { createFetchStep, type IngestDeps } from "./fetch";
import { createNormalizeStep } from "./normalize";
import { createValidateStep } from "./validate";

export type { IngestDeps } from "./fetch";
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
