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
export {
  computeSignals,
  decayWeight,
  formatReach,
  operationalScore,
  percentiles,
  readerSignals,
  type ReaderSignals,
  type ComputedSignals,
  type FetchHealth,
  type ReaderEvent,
  type SourceRawInput,
  type SourceStatsDay,
  type TrendDirection,
} from "./signals";
export { scoreBreakdown, type ScoreComponent } from "./breakdown";
export { assignVariant, splitValid } from "./experiments";
export {
  compareToControl,
  variantMetrics,
  type ControlComparison,
  type ReaderSourceRow,
  type VariantMetrics,
} from "./experiment-metrics";
export {
  CONCENTRATION_ALERT,
  concentrationAlert,
  concentrationTop3,
  diversityIndex,
  proportionTest,
  sharesOf,
  weightsValid,
} from "./metrics";
