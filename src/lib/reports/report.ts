import { z } from "zod";
import { REPORT } from "@/content/pt-BR/portal-article";
import type { Result } from "@/lib/result";
import { REPORT_HONEYPOT, REPORT_KINDS, type ReportKind, type ReportState } from "./form-state";

export {
  REPORT_HONEYPOT,
  REPORT_IDLE,
  REPORT_KINDS,
  type ReportKind,
  type ReportState,
  type ReportStatus,
} from "./form-state";

export interface NewReport {
  contentRef: string;
  kind: ReportKind;
  message: string | null;
  contactEmail: string | null;
}

type SaveError = { kind: "unconfigured" | "unavailable" };

export interface ReportDeps {
  allow: () => Promise<Result<boolean, SaveError>>;
  save: (r: NewReport) => Promise<Result<void, SaveError>>;
}

/** Limite dos formulários públicos: 5 por hora por IP com hash (architecture §7). */
export const REPORT_LIMIT = 5;
export const REPORT_WINDOW_SECONDS = 3600;

const contentRef = z.string().regex(/^(article|event|topic|aggregated):[0-9a-f-]{36}$/);
const kind = z.enum(REPORT_KINDS);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** "Informar problema" (P03): sem login, valida, aplica honeypot e limite, grava. */
export async function reportProblem(form: FormData, deps: ReportDeps): Promise<ReportState> {
  const get = (k: string) => String(form.get(k) ?? "");
  if (get(REPORT_HONEYPOT).trim() !== "") return { status: "success", message: REPORT.success };

  const ref = contentRef.safeParse(get("contentRef"));
  const k = kind.safeParse(get("kind"));
  if (!ref.success || !k.success) {
    return { status: "invalid", message: REPORT.kindRequired, field: "kind" };
  }
  const message = get("message").trim().slice(0, 1000) || null;
  const rawContact = get("contact").trim();
  let contactEmail: string | null = null;
  if (rawContact) {
    const parsed = email.safeParse(rawContact);
    if (!parsed.success)
      return { status: "invalid", message: REPORT.invalidEmail, field: "contact" };
    contactEmail = parsed.data;
  }

  const allowed = await deps.allow();
  if (!allowed.ok) return { status: "error", message: REPORT.error };
  if (!allowed.value) return { status: "rate_limited", message: REPORT.rateLimited };

  const saved = await deps.save({ contentRef: ref.data, kind: k.data, message, contactEmail });
  if (!saved.ok) return { status: "error", message: REPORT.error };
  return { status: "success", message: REPORT.success };
}
