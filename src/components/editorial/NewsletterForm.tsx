"use client";

import { useActionState, useId } from "react";
import {
  HONEYPOT_FIELD,
  LISTS_PICKED_FIELD,
  NEWSLETTER_IDLE,
  type NewsletterState,
} from "@/lib/newsletter/form-state";
import { NEWSLETTER, NEWSLETTER_PAGE } from "@/content/pt-BR/newsletter";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { FieldError } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/TextField";

export interface NewsletterFormProps {
  /** Server Action que valida, aplica limite de uso e grava. */
  action: (state: NewsletterState, form: FormData) => Promise<NewsletterState>;
  /** Com listas, o formulário pede a escolha (página /newsletter); sem elas, vale a diária. */
  lists?: { id: string; name: string; when: string }[];
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
export function NewsletterForm({ action, lists, className }: NewsletterFormProps) {
  const [state, formAction, pending] = useActionState(action, NEWSLETTER_IDLE);
  const id = useId();
  const listsError = state.status === "invalid" && state.field === "lists" ? state.message : "";
  const fieldError =
    (state.status === "invalid" && !listsError) ||
    state.status === "rate_limited" ||
    state.status === "error"
      ? state.message
      : undefined;
  const done = state.status === "success" || state.status === "already";
  return (
    <form action={formAction} noValidate className={cx("flex flex-col gap-3", className)}>
      {lists && (
        <fieldset
          aria-describedby={listsError ? `${id}-lists-erro` : undefined}
          className="flex flex-col gap-1"
        >
          <legend className="mb-1 type-body font-semibold text-strong">
            {NEWSLETTER_PAGE.listsLegend}
          </legend>
          <input type="hidden" name={LISTS_PICKED_FIELD} value="1" />
          {lists.map((l, i) => (
            <Checkbox
              key={l.id}
              name="lists"
              value={l.id}
              defaultChecked={i === 0}
              label={
                <span>
                  {l.name} <span className="type-meta text-meta">· {l.when}</span>
                </span>
              }
            />
          ))}
          <FieldError id={`${id}-lists`} error={listsError} />
        </fieldset>
      )}
      <div className={cx("flex flex-col gap-3", !lists && "sm:flex-row sm:items-start")}>
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
        <Button type="submit" disabled={pending} className={lists ? undefined : "sm:mt-7.5"}>
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
        {done ? (
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
