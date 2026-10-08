"use server";

import { headers } from "next/headers";
import { publicContentExists } from "@/lib/db/queries";
import { hitRateLimit, saveReport } from "@/lib/db/writes";
import {
  REPORT_LIMIT,
  REPORT_WINDOW_SECONDS,
  reportProblem,
  type ReportState,
} from "@/lib/reports/report";
import { ok } from "@/lib/result";
import { clientRateKey } from "@/lib/security/rate-limit";

/** "Informar problema": sem login, 5 envios por hora por IP com hash (Review Focus 5). */
export async function reportProblemAction(
  _prev: ReportState,
  form: FormData,
): Promise<ReportState> {
  const key = clientRateKey(await headers(), new Date());
  return reportProblem(form, {
    allow: () =>
      key === null
        ? Promise.resolve(ok(false))
        : hitRateLimit("report", key, REPORT_LIMIT, REPORT_WINDOW_SECONDS),
    save: saveReport,
    exists: publicContentExists,
  });
}
