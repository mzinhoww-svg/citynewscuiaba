import type { z } from "zod";
import type { AgentId } from "../types";
import { AnswerDraftSchema } from "./answer";
import { ClassifySchema } from "./classify";
import { ImageSchema } from "./image";
import { LocateSchema } from "./locate";
import { VerifySchema } from "./verify";
import { WriteSchema } from "./write";

export { AnswerDraftSchema, ClassifySchema, ImageSchema, LocateSchema, VerifySchema, WriteSchema };

/** Schema de saída de cada agente. */
export const AGENT_SCHEMAS = {
  classify: ClassifySchema,
  locate: LocateSchema,
  verify: VerifySchema,
  write: WriteSchema,
  answer: AnswerDraftSchema,
  image: ImageSchema,
} satisfies Record<AgentId, z.ZodType>;
