/** Ranking de fontes (spec §7; tracking-plan §4–5). Funções puras. */
export { capItems, rankSources } from "./rank";
export {
  explainRecommendation,
  isSafeTopic,
  LOCAL_LOCALITIES,
  reasonFor,
  TRENDING_MIN,
} from "./explain";
export {
  DEFAULT_REC_CONFIG,
  effectiveWeights,
  parseRecConfig,
  REC_V1,
  scoreSource,
  WEIGHT_KEYS,
} from "./score";
export { isQualifiedRead, isWeakSignal } from "@/lib/events/weak";
export type * from "./types";
