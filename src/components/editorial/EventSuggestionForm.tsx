"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import { SUGGEST } from "@/content/pt-BR/portal";
import {
  AGE_RATINGS,
  SUBMIT_HONEYPOT,
  SUBMIT_IDLE,
  type SubmitField,
  type SubmitState,
} from "@/lib/agenda/submission";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { TextField } from "../ui/TextField";

export interface EventSuggestionFormProps {
  /** Server Action com honeypot e limite de 5/h por IP. */
  action: (state: SubmitState, form: FormData) => Promise<SubmitState>;
}

function Optional() {
  return <span className="type-meta text-meta">{SUGGEST.optional}</span>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 type-meta text-danger">
      <Icon name="circle-alert" size={16} />
      {message}
    </p>
  );
}

/**
 * Sugerir evento (P11): sem login. Validação no servidor com erro por campo e exemplo; o que
 * foi digitado volta preenchido. Campo-armadilha contra robôs.
 *
 * ```tsx
 * <EventSuggestionForm action={suggestEventAction} />
 * ```
 */
export function EventSuggestionForm({ action }: EventSuggestionFormProps) {
  const [state, formAction, pending] = useActionState(action, SUBMIT_IDLE);
  const id = useId();
  const f = (k: SubmitField) => `${id}-${k}`;
  const val = (k: SubmitField) => state.values[k] ?? "";
  const err = (k: SubmitField) => state.errors[k];

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-start gap-4 border border-line-section bg-card-white p-6">
        <p role="status" className="flex items-start gap-2 type-body text-service">
          <Icon name="check" size={20} className="mt-0.5 shrink-0" />
          {state.message}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button href="/agenda" size="md">
            {SUGGEST.backAgenda}
          </Button>
          <Button href="/agenda/sugerir" size="md" variant="outline">
            {SUGGEST.another}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      key={JSON.stringify(state.values)}
      action={formAction}
      noValidate
      className="flex flex-col gap-6"
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
        id={f("title")}
        name="title"
        label={SUGGEST.fields.title}
        placeholder={SUGGEST.placeholders.title}
        defaultValue={val("title")}
        error={err("title")}
        maxLength={120}
        required
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TextField
          id={f("startsAt")}
          name="startsAt"
          type="datetime-local"
          label={SUGGEST.fields.startsAt}
          hint={SUGGEST.hints.startsAt}
          defaultValue={val("startsAt")}
          error={err("startsAt")}
          required
        />
        <TextField
          id={f("endsAt")}
          name="endsAt"
          type="datetime-local"
          label={`${SUGGEST.fields.endsAt} (${SUGGEST.optional})`}
          defaultValue={val("endsAt")}
          error={err("endsAt")}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <TextField
          id={f("venue")}
          name="venue"
          label={SUGGEST.fields.venue}
          hint={SUGGEST.hints.venue}
          placeholder={SUGGEST.placeholders.venue}
          defaultValue={val("venue")}
          error={err("venue")}
          maxLength={160}
          required
        />
        <Select
          id={f("neighborhood")}
          name="neighborhood"
          label={SUGGEST.fields.neighborhood}
          labelAside={<Optional />}
          placeholder={SUGGEST.otherNeighborhood}
          defaultValue={val("neighborhood")}
          options={NEIGHBORHOODS.map((n) => ({ value: n.slug, label: n.name }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="flex min-h-tap cursor-pointer items-center gap-3 type-body text-strong">
            <input
              type="checkbox"
              name="free"
              value="1"
              defaultChecked={val("free") === "1"}
              className="size-5 shrink-0 accent-(--action-primary)"
            />
            {SUGGEST.fields.free}
          </label>
          <TextField
            id={f("price")}
            name="price"
            inputMode="decimal"
            label={SUGGEST.fields.price}
            hint={SUGGEST.hints.price}
            placeholder={SUGGEST.placeholders.price}
            defaultValue={val("price")}
            error={err("price")}
          />
        </div>
        <Select
          id={f("ageRating")}
          name="ageRating"
          label={SUGGEST.fields.ageRating}
          defaultValue={val("ageRating") || "livre"}
          options={AGE_RATINGS.map((a) => ({ value: a, label: SUGGEST.ages[a] }))}
        />
      </div>
      <TextField
        id={f("link")}
        name="link"
        type="url"
        inputMode="url"
        label={`${SUGGEST.fields.link} (${SUGGEST.optional})`}
        placeholder={SUGGEST.placeholders.link}
        defaultValue={val("link")}
        error={err("link")}
      />
      <div className="flex flex-col gap-2">
        <label htmlFor={f("description")} className="type-label text-16 text-strong">
          {SUGGEST.fields.description} ({SUGGEST.optional})
        </label>
        <textarea
          id={f("description")}
          name="description"
          rows={4}
          maxLength={500}
          defaultValue={val("description")}
          aria-invalid={err("description") ? true : undefined}
          aria-describedby={`${f("description")}-dica${err("description") ? ` ${f("description")}-erro` : ""}`}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
        <p id={`${f("description")}-dica`} className="type-meta text-meta">
          {SUGGEST.hints.description}
        </p>
        <FieldError id={`${f("description")}-erro`} message={err("description")} />
      </div>
      <TextField
        id={f("email")}
        name="email"
        type="email"
        icon="mail"
        label={SUGGEST.fields.email}
        hint={SUGGEST.hints.email}
        placeholder={SUGGEST.placeholders.email}
        autoComplete="email"
        defaultValue={val("email")}
        error={err("email")}
        required
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
          {SUGGEST.fields.consent}
        </label>
        <FieldError id={`${f("consent")}-erro`} message={err("consent")} />
      </div>
      <div hidden>
        <label htmlFor={`${id}-${SUBMIT_HONEYPOT}`}>{SUGGEST.honeypotLabel}</label>
        <input
          id={`${id}-${SUBMIT_HONEYPOT}`}
          name={SUBMIT_HONEYPOT}
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? SUGGEST.sending : SUGGEST.submit}
        </Button>
        <Link
          href="/agenda"
          className="inline-flex min-h-tap items-center text-14 font-semibold text-link underline underline-offset-4 hover:text-strong"
        >
          {SUGGEST.backAgenda}
        </Link>
      </div>
    </form>
  );
}
