"use client";

import { useActionState, useId } from "react";
import { REPLY } from "@/content/pt-BR/institutional";
import {
  REPLY_HONEYPOT,
  REPLY_IDLE,
  type ReplyField,
  type ReplyState,
} from "@/lib/reports/form-state";
import { Button } from "../ui/Button";
import { FieldError } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { TextArea } from "../ui/TextArea";
import { TextField } from "../ui/TextField";

export interface RightOfReplyFormProps {
  /** Server Action com honeypot e limite de 5/h por IP. */
  action: (state: ReplyState, form: FormData) => Promise<ReplyState>;
}

/**
 * Pedido de direito de resposta (P24): sem login. Validação no servidor com erro por campo e
 * exemplo; o que foi digitado volta preenchido. Campo-armadilha contra robôs.
 *
 * ```tsx
 * <RightOfReplyForm action={rightOfReplyAction} />
 * ```
 */
export function RightOfReplyForm({ action }: RightOfReplyFormProps) {
  const [state, formAction, pending] = useActionState(action, REPLY_IDLE);
  const id = useId();
  const f = (k: ReplyField) => `${id}-${k}`;
  const val = (k: ReplyField) => state.values[k] ?? "";
  const err = (k: ReplyField) => state.errors[k];

  if (state.status === "success") {
    return (
      <div className="flex max-w-read flex-col items-start gap-4 border border-line-section bg-card-white p-6">
        <p role="status" className="flex items-start gap-2 type-body text-service">
          <Icon name="check" size={20} className="mt-0.5 shrink-0" />
          {state.message}
        </p>
        <Button href="/" size="md" variant="outline">
          {REPLY.backHome}
        </Button>
      </div>
    );
  }

  return (
    <form
      key={JSON.stringify(state.values)}
      action={formAction}
      noValidate
      className="flex max-w-read flex-col gap-6"
    >
      <div aria-live="polite">
        {(state.status === "invalid" ||
          state.status === "rate_limited" ||
          state.status === "error") && (
          <p
            role="alert"
            className="flex items-start gap-2 bg-erro-soft px-4 py-3 type-body text-danger"
          >
            <Icon name="circle-alert" size={20} className="mt-0.5 shrink-0" />
            {state.message}
          </p>
        )}
      </div>
      <TextField
        id={f("name")}
        name="name"
        label={REPLY.fields.name}
        placeholder={REPLY.placeholders.name}
        autoComplete="name"
        defaultValue={val("name")}
        error={err("name")}
        maxLength={120}
        required
      />
      <TextField
        id={f("email")}
        name="email"
        type="email"
        icon="mail"
        label={REPLY.fields.email}
        hint={REPLY.hints.email}
        placeholder={REPLY.placeholders.email}
        autoComplete="email"
        defaultValue={val("email")}
        error={err("email")}
        required
      />
      <TextField
        id={f("article")}
        name="article"
        type="url"
        inputMode="url"
        label={REPLY.fields.article}
        hint={REPLY.hints.article}
        placeholder={REPLY.placeholders.article}
        defaultValue={val("article")}
        error={err("article")}
        required
      />
      <TextArea
        id={f("reply")}
        name="reply"
        label={REPLY.fields.reply}
        hint={REPLY.hints.reply}
        rows={8}
        maxLength={3000}
        required
        defaultValue={val("reply")}
        error={err("reply")}
      />
      <div className="flex flex-col gap-1">
        <label className="flex min-h-tap cursor-pointer items-start gap-3 py-2 type-body text-strong">
          <input
            type="checkbox"
            name="consent"
            value="1"
            defaultChecked={val("consent") === "1"}
            aria-invalid={err("consent") ? true : undefined}
            aria-describedby={err("consent") ? `${f("consent")}-erro` : undefined}
            className="mt-1 size-5 shrink-0 accent-(--action-primary)"
          />
          {REPLY.fields.consent}
        </label>
        <FieldError id={f("consent")} error={err("consent")} />
      </div>
      <div hidden>
        <label htmlFor={`${id}-${REPLY_HONEYPOT}`}>{REPLY.honeypotLabel}</label>
        <input
          id={`${id}-${REPLY_HONEYPOT}`}
          name={REPLY_HONEYPOT}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div>
        <Button type="submit" loading={pending} loadingLabel={REPLY.sending}>
          {REPLY.submit}
        </Button>
      </div>
    </form>
  );
}
