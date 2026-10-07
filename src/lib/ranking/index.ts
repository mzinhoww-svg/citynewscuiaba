/** Ranking de fontes (spec §7; tracking-plan §4–5). Funções puras. */
export { capItems, rankSources } from "./rank";
export { explainRecommendation } from "./explain";
export { DEFAULT_REC_CONFIG, effectiveWeights, REC_V1, scoreSource } from "./score";
export type * from "./types";
export {
  computeSignals,
  formatReach,
  type ComputedSignals,
  type ReaderEvent,
  type SourceRawInput,
} from "./signals";
