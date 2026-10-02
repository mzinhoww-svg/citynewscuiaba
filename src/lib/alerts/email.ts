import { z } from "zod";
import { ALERTS_TEXT } from "@/content/pt-BR/alerts";
import type { AlertKind } from "@/lib/anon/types";
import type { ReaderEmail } from "@/lib/newsletter/subscribe";
import type { Result } from "@/lib/result";

type SaveError = { kind: "unconfigured" | "unavailable" };

export interface EmailAlertDeps {
  allow: () => Promise<Result<boolean, SaveError>>;
  save: (a: {
    email: string;
    targetKind: string;
    targetId: string;
    frequency: "immediate" | "daily" | "weekly";
  }) => Promise<Result<{ id: string }, SaveError>>;
  queue: (mail: ReaderEmail) => Promise<Result<void, SaveError>>;
  /** Link assinado de confirmação para o alerta criado. */
  link: (email: string, alertId: string) => string | null;
  /**
   * Nome do alvo no servidor (bairro, editoria, assunto público); `null` quando o alvo não
   * existe. O texto do e-mail nunca usa rótulo vindo do cliente (gate P2, I8).
   */
  resolveLabel: (kind: AlertKind, target: string) => Promise<string | null>;
}

export type EmailAlertResult =
  { status: "pending"; email: string } | { status: "invalid" | "rate_limited" | "error" };

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  kind: z.enum(["bairro", "tema", "assunto", "urgentes", "agenda"]),
  target: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(120),
  /** Ignorado: o rótulo sai de `resolveLabel`. Aceito só para não quebrar clientes antigos. */
  label: z.string().max(200).optional(),
  frequency: z.enum(["immediate", "daily", "weekly"]),
});

/**
 * Alerta por e-mail sem conta (P18): valida, aplica o limite por IP, grava inativo e põe na
 * fila (`reader_emails`, B-005) o e-mail com o link assinado de confirmação.
 */
export async function createEmailAlert(
  input: unknown,
  deps: EmailAlertDeps,
): Promise<EmailAlertResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const a = parsed.data;
  const allowed = await deps.allow();
  if (!allowed.ok) return { status: "error" };
  if (!allowed.value) return { status: "rate_limited" };
  const label = await deps.resolveLabel(a.kind, a.target);
  if (!label) return { status: "invalid" };
  const saved = await deps.save({
    email: a.email,
    targetKind: a.kind,
    targetId: a.target,
    frequency: a.frequency,
  });
  if (!saved.ok) return { status: "error" };
  const link = deps.link(a.email, saved.value.id);
  if (!link) return { status: "error" };
  const queued = await deps.queue({
    kind: "alert_confirm",
    to: a.email,
    subject: ALERTS_TEXT.mailSubject,
    body: ALERTS_TEXT.mailBody(`${ALERTS_TEXT.kinds[a.kind]}: ${label}`, link),
    ref: `alert:${saved.value.id}`,
  });
  if (!queued.ok) return { status: "error" };
  return { status: "pending", email: a.email };
}
