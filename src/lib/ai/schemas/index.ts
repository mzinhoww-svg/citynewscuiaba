import type { z } from "zod";
import type { AgentId } from "../types";
import { AggregateSummarySchema } from "./aggregate-summary";
import { AnswerDraftSchema } from "./answer";
import { ClassifySchema } from "./classify";
import { eventPageSchema } from "./event-extract";
import { ImageSchema } from "./image";
import { LocateSchema } from "./locate";
import { ReviewSchema } from "./review";
import { sourceProfileSchema } from "./source-profile";
import { VerifySchema } from "./verify";
import { WriteSchema } from "./write";

export { ClassifySchema };

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
  // A listagem usa `eventListingSchema` com o mesmo agente (src/lib/agenda/extract/ai-page.ts).
  event_extractor: eventPageSchema,
} satisfies Record<AgentId, z.ZodType>;
