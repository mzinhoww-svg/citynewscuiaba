import type { z } from "zod";
import type { AgentId } from "../types";
import { AggregateSummarySchema } from "./aggregate-summary";
import { AnswerDraftSchema } from "./answer";
import { ClassifySchema } from "./classify";
import { ImageSchema } from "./image";
import { LocateSchema } from "./locate";
import { ReviewSchema } from "./review";
import { sourceProfileSchema } from "./source-profile";
import { VerifySchema } from "./verify";
import { WriteSchema } from "./write";

export {
  AggregateSummarySchema,
  AnswerDraftSchema,
  ClassifySchema,
  ImageSchema,
  LocateSchema,
  ReviewSchema,
  sourceProfileSchema,
  VerifySchema,
  WriteSchema,
};

/** Schema de saída de cada agente. */
export const AGENT_SCHEMAS = {
  classify: ClassifySchema,
  locate: LocateSchema,
  verify: VerifySchema,
  write: WriteSchema,
  answer: AnswerDraftSchema,
  image: ImageSchema,
  aggregate_summary: AggregateSummarySchema,
  source_profiler: sourceProfileSchema,
  reviewer: ReviewSchema,
} satisfies Record<AgentId, z.ZodType>;
