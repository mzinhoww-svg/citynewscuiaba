"use server";

import { headers } from "next/headers";
import { hitRateLimit, saveReport } from "@/lib/db/writes";
import {
  REPORT_LIMIT,
  REPORT_WINDOW_SECONDS,
  reportProblem,
  type ReportState,
} from "@/lib/reports/report";
import { clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";

/** "Informar problema": sem login, 5 envios por hora por IP com hash (Review Focus 5). */
export async function reportProblemAction(
  _prev: ReportState,
  form: FormData,
): Promise<ReportState> {
  const key = ipKey(clientIp(await headers()), new Date(), rateLimitSalt());
  return reportProblem(form, {
    allow: () => hitRateLimit("report", key, REPORT_LIMIT, REPORT_WINDOW_SECONDS),
    save: saveReport,
  });
}
