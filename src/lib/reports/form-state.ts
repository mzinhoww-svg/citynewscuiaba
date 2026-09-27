/** Estado dos formulários de denúncia e direito de resposta, sem zod: importável por Client Components. */
/** Tipos de problema (tabela `reports`, docs/screens.md E14). */
export const REPORT_KINDS = [
  "wrong_info",
  "broken_link",
  "image",
  "right_of_reply",
  "other",
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type ReportStatus = "idle" | "success" | "invalid" | "rate_limited" | "error";

export interface ReportState {
  status: ReportStatus;
  message: string;
  /** Campo com erro, para ligar a mensagem ao controle. */
  field?: "kind" | "contact" | "message";
}

export const REPORT_IDLE: ReportState = { status: "idle", message: "" };

/** Campo-armadilha: invisível para pessoas; robôs preenchem. */
export const REPORT_HONEYPOT = "website";

/** Direito de resposta (P24). */
export const REPLY_FIELDS = ["name", "email", "article", "reply", "consent"] as const;
export type ReplyField = (typeof REPLY_FIELDS)[number];

export const REPLY_HONEYPOT = "website";

export interface ReplyState {
  status: "idle" | "success" | "invalid" | "rate_limited" | "error";
  message: string;
  errors: Partial<Record<ReplyField, string>>;
  values: Partial<Record<ReplyField, string>>;
}

export const REPLY_IDLE: ReplyState = { status: "idle", message: "", errors: {}, values: {} };
