"use client";

import { useActionState, useId } from "react";
import { HONEYPOT_FIELD, NEWSLETTER_IDLE, type NewsletterState } from "@/lib/newsletter/subscribe";
import { NEWSLETTER } from "@/content/pt-BR/portal";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/TextField";

export interface NewsletterFormProps {
  /** Server Action que valida, aplica limite de uso e grava. */
  action: (state: NewsletterState, form: FormData) => Promise<NewsletterState>;
  className?: string;
}

/**
 * Inscrição na newsletter: só e-mail (spec §5), sem login. Erro com ícone, texto e exemplo;
 * o que foi digitado é preservado. Campo-armadilha invisível contra robôs.
 *
 * ```tsx
 * <NewsletterForm action={subscribeNewsletterAction} />
 * ```
 */
export function NewsletterForm({ action, className }: NewsletterFormProps) {
  const [state, formAction, pending] = useActionState(action, NEWSLETTER_IDLE);
  const id = useId();
  const fieldError =
    state.status === "invalid" || state.status === "rate_limited" || state.status === "error"
      ? state.message
      : undefined;
  return (
    <form action={formAction} noValidate className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          key={`${state.status}-${state.email}`}
          id={`${id}-email`}
          name="email"
          type="email"
          icon="mail"
          label={NEWSLETTER.label}
          placeholder={NEWSLETTER.placeholder}
          autoComplete="email"
          defaultValue={state.email}
          error={fieldError}
          className="flex-1"
        />
        <Button type="submit" disabled={pending} className="sm:mt-7.5">
          {pending ? NEWSLETTER.sending : NEWSLETTER.submit}
        </Button>
      </div>
      <div hidden>
        <label htmlFor={`${id}-${HONEYPOT_FIELD}`}>{NEWSLETTER.honeypotLabel}</label>
        <input
          id={`${id}-${HONEYPOT_FIELD}`}
          name={HONEYPOT_FIELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <p role="status" className="type-meta text-meta">
        {state.status === "success" ? (
          <span className="inline-flex items-start gap-1.5 text-service">
            <Icon name="check" size={16} />
            {state.message}
          </span>
        ) : (
          NEWSLETTER.privacy
        )}
      </p>
    </form>
  );
}
