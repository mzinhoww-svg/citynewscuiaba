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
import { ok } from "@/lib/result";
import { clientRateKey } from "@/lib/security/rate-limit";

/** Direito de resposta: sem login, honeypot e 5 pedidos por hora por IP com hash. */
export async function rightOfReplyAction(_prev: ReplyState, form: FormData): Promise<ReplyState> {
  const key = clientRateKey(await headers(), new Date());
  return requestRightOfReply(form, {
    findArticle: findPublicArticleId,
    allow: () =>
      key === null
        ? Promise.resolve(ok(false))
        : hitRateLimit("right_of_reply", key, REPLY_LIMIT, REPLY_WINDOW_SECONDS),
    save: saveReport,
  });
}
