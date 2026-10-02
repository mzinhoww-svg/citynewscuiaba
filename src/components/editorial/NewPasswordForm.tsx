"use client";

import { useActionState, useId, useState } from "react";
import { ACCOUNT_TEXT as A, RECOVER_TEXT as T, SIGN_UP_TEXT } from "@/content/pt-BR/account";
import { IDLE, type NewPasswordState } from "@/lib/auth/form-state";
import { passwordStrength } from "@/lib/auth/password";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { TextField } from "../ui/TextField";
import { useHydratedForm } from "../ui/useHydratedForm";

export interface NewPasswordFormProps {
  action: (state: NewPasswordState, form: FormData) => Promise<NewPasswordState>;
  submit?: string;
}

/** Nova senha e confirmação (C04 e Perfil): força em texto, erro por campo. */
export function NewPasswordForm({ action, submit = T.resetSubmit }: NewPasswordFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE as NewPasswordState);
  const [password, setPassword] = useState("");
  const { ref, ready } = useHydratedForm(({ text }) => setPassword((v) => text("password") ?? v));
  const id = useId();
  const strength = password ? passwordStrength(password) : null;
  return (
    <form
      ref={ref}
      action={formAction}
      noValidate
      className="flex flex-col gap-5"
      data-ready={ready ? "true" : undefined}
    >
      <div className="flex flex-col gap-2">
        <TextField
          id={`${id}-senha`}
          name="password"
          type="password"
          label={T.newPassword}
          icon="lock"
          autoComplete="new-password"
          hint={SIGN_UP_TEXT.passwordHint}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={
            state.status === "invalid" && state.field === "password"
              ? SIGN_UP_TEXT.passwordError
              : undefined
          }
        />
        <p aria-live="polite" className="type-meta text-strong">
          {strength?.text}
        </p>
      </div>
      <TextField
        id={`${id}-confirmar`}
        name="confirm"
        type="password"
        label={T.confirm}
        icon="lock"
        autoComplete="new-password"
        error={state.status === "invalid" && state.field === "confirm" ? T.confirmError : undefined}
      />
      <div aria-live="polite" className="empty:hidden">
        {state.status === "expired" && (
          <InlineAlert tone="error" title={T.resetExpired} role="alert">
            <p>{T.resetExpiredDetail}</p>
          </InlineAlert>
        )}
        {state.status === "unavailable" && (
          <InlineAlert tone="error" title={A.unavailable} role="alert" />
        )}
      </div>
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? T.resetBusy : submit}
      </Button>
    </form>
  );
}
