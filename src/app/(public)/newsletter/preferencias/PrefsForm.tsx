"use client";

import { useActionState } from "react";
import { Button, Checkbox, FormStatus, InlineAlert } from "@/components";
import { NEWSLETTER_PREFS as T } from "@/content/pt-BR/newsletter";
import { savePrefsAction, type PrefsState } from "../actions";

export interface PrefsFormProps {
  token: string;
  lists: { id: string; name: string; when: string; state: "active" | "pending" | "off" }[];
}

const IDLE: PrefsState = { status: "idle" };

/** Marcar e desmarcar listas; "Sair de todas" com volta ("Mudou de ideia?"). */
export function PrefsForm({ token, lists }: PrefsFormProps) {
  const [state, action, pending] = useActionState(savePrefsAction, IDLE);
  if (state.status === "off")
    return (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="intent" value="resubscribe" />
        <InlineAlert tone="info" title={T.unsubscribedTitle} role="status">
          <p>{T.unsubscribedText}</p>
        </InlineAlert>
        <Button type="submit" disabled={pending} className="self-start">
          {T.resubscribe}
        </Button>
      </form>
    );
  const message =
    state.status === "saved"
      ? T.saved
      : state.status === "expired"
        ? T.expiredText
        : state.status === "invalid"
          ? T.invalidText
          : state.status === "error"
            ? T.errorText
            : "";
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <fieldset className="flex flex-col gap-1 border border-line-section bg-card-white p-4">
        <legend className="sr-only">{T.title}</legend>
        {lists.map((l) => (
          <Checkbox
            key={l.id}
            name="lists"
            value={l.id}
            defaultChecked={l.state !== "off"}
            label={
              <span>
                {l.name}{" "}
                <span className="type-meta text-meta">
                  · {l.when} · {T.status[l.state]}
                </span>
              </span>
            }
          />
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {T.save}
        </Button>
        <button
          type="submit"
          name="intent"
          value="off"
          disabled={pending}
          className="inline-flex min-h-tap cursor-pointer items-center px-2 text-16 font-semibold text-danger underline-offset-4 hover:underline"
        >
          {T.unsubscribeAll}
        </button>
      </div>
      <FormStatus tone={state.status === "saved" ? "success" : "error"} message={message} />
    </form>
  );
}
