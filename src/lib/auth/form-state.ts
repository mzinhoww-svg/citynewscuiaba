/**
 * Estados dos formulários de conta (Server Actions com `useActionState`). Fora dos arquivos
 * "use server", que só podem exportar funções.
 */
export type SignInState =
  | { status: "idle" }
  | { status: "invalid"; email: boolean; password: boolean }
  | { status: "wrong"; remaining: number }
  | { status: "locked"; retryAt: string }
  | { status: "not_confirmed"; email: string }
  | { status: "unavailable" };

export type EmailLinkState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "sent"; email: string }
  | { status: "rate_limited" }
  | { status: "unavailable" };

export type SignUpState =
  | { status: "idle" }
  | {
      status: "invalid";
      fields: Partial<Record<"name" | "email" | "password" | "terms", true>>;
    }
  | { status: "exists" }
  | { status: "check_email"; email: string }
  | { status: "unavailable" };

export type NewPasswordState =
  | { status: "idle" }
  | { status: "invalid"; field: "password" | "confirm" }
  | { status: "expired" }
  | { status: "unavailable" };

export type ConfirmState =
  { status: "idle" } | { status: "confirmed" } | { status: "expired" } | { status: "unavailable" };

export const IDLE = { status: "idle" } as const;

export type ProfileState =
  { status: "idle" } | { status: "saved" } | { status: "invalid" } | { status: "unavailable" };

export type DeleteState = { status: "idle" } | { status: "invalid" } | { status: "unavailable" };

export type ExportResult = { ok: true; data: string } | { ok: false };
