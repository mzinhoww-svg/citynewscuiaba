"use client";

import { useActionState, useId, useState } from "react";
import { ACCOUNT_TEXT as A } from "@/content/pt-BR/account";
import { IDLE, type EmailLinkState } from "@/lib/auth/form-state";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { TextField } from "../ui/TextField";

export interface EmailLinkFormProps {
  action: (state: EmailLinkState, form: FormData) => Promise<EmailLinkState>;
  submit: string;
  busy: string;
  /** Mensagem neutra depois do envio (nunca revela se o e-mail tem conta). */
  sent: string;
  sentDetail?: string;
  defaultEmail?: string;
  /** Campos escondidos (ex.: `next`). */
  hidden?: Record<string, string>;
}

/**
 * Formulário de um campo para pedir link por e-mail: recuperar senha (C04) e reenviar
 * confirmação (C05). Resposta sempre neutra.
 */
export function EmailLinkForm({
  action,
  submit,
  busy,
  sent,
  sentDetail,
  defaultEmail = "",
  hidden = {},
}: EmailLinkFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE as EmailLinkState);
  const [email, setEmail] = useState(defaultEmail);
  const id = useId();
  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <TextField
        id={`${id}-email`}
        name="email"
        type="email"
        label={A.email}
        icon="mail"
        autoComplete="email"
        inputMode="email"
        placeholder={A.emailPlaceholder}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={state.status === "invalid" ? A.emailError : undefined}
      />
      <div aria-live="polite" className="empty:hidden">
        {state.status === "sent" && (
          <InlineAlert tone="success" title={sent}>
            {sentDetail && <p>{sentDetail}</p>}
          </InlineAlert>
        )}
        {state.status === "unavailable" && (
          <InlineAlert tone="error" title={A.unavailable} role="alert" />
        )}
        {state.status === "rate_limited" && (
          <InlineAlert tone="warn" title={A.rateLimited} role="alert" />
        )}
      </div>
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? busy : submit}
      </Button>
    </form>
  );
}
