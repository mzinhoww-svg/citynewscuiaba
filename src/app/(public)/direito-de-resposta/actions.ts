"use server";

import { headers } from "next/headers";
import { findPublicArticleId } from "@/lib/db/queries";
import { hitRateLimit, saveReport } from "@/lib/db/writes";
import {
  REPLY_LIMIT,
  REPLY_WINDOW_SECONDS,
  requestRightOfReply,
  type ReplyState,
} from "@/lib/reports/right-of-reply";
import { clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";

/** Direito de resposta: sem login, honeypot e 5 pedidos por hora por IP com hash. */
export async function rightOfReplyAction(_prev: ReplyState, form: FormData): Promise<ReplyState> {
  const key = ipKey(clientIp(await headers()), new Date(), rateLimitSalt());
  return requestRightOfReply(form, {
    findArticle: findPublicArticleId,
    allow: () => hitRateLimit("right_of_reply", key, REPLY_LIMIT, REPLY_WINDOW_SECONDS),
    save: saveReport,
  });
}
