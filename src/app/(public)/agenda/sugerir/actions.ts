"use server";

import { headers } from "next/headers";
import {
  SUBMIT_LIMIT,
  SUBMIT_WINDOW_SECONDS,
  submitEvent,
  type SubmitState,
} from "@/lib/agenda/submission";
import { hitRateLimit, saveEventSubmission } from "@/lib/db/writes";
import { ok } from "@/lib/result";
import { clientRateKey } from "@/lib/security/rate-limit";

/** Sugerir evento: sem login, honeypot e 5 envios por hora por IP com hash. */
export async function suggestEventAction(_prev: SubmitState, form: FormData): Promise<SubmitState> {
  const key = clientRateKey(await headers(), new Date());
  return submitEvent(form, {
    allow: () =>
      key === null
        ? Promise.resolve(ok(false))
        : hitRateLimit("event_submission", key, SUBMIT_LIMIT, SUBMIT_WINDOW_SECONDS),
    save: saveEventSubmission,
  });
}
