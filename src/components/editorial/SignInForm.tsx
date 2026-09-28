"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { ACCOUNT_TEXT as A, SIGN_IN_TEXT as T } from "@/content/pt-BR/account";
import { IDLE, type EmailLinkState, type SignInState } from "@/lib/auth/form-state";
import { formatHour } from "@/lib/format/date";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { TextField } from "../ui/TextField";

export interface SignInFormProps {
  signIn: (state: SignInState, form: FormData) => Promise<SignInState>;
  magicLink: (state: EmailLinkState, form: FormData) => Promise<EmailLinkState>;
  /** Server Action do Google; `null` quando o provedor não está configurado (B-006). */
  google: ((form: FormData) => Promise<void>) | null;
  next: string;
}

/**
 * Entrar (C02): e-mail e senha, "Esqueci a senha", link mágico no mesmo campo de e-mail e
 * Google quando configurado. Erro genérico com tentativas restantes; bloqueio de 15 min
 * explicado com alternativas. O e-mail digitado nunca se perde.
 */
export function SignInForm({ signIn, magicLink, google, next }: SignInFormProps) {
  const [state, signInAction, signingIn] = useActionState(signIn, IDLE as SignInState);
  const [magic, magicAction, sending] = useActionState(magicLink, IDLE as EmailLinkState);
  const [email, setEmail] = useState("");
  const id = useId();
  const busy = signingIn || sending;

  const emailError =
    (state.status === "invalid" && state.email) || magic.status === "invalid"
      ? A.emailError
      : undefined;

  return (
    <div className="flex flex-col gap-8">
      <form action={signInAction} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="next" value={next} />
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
          error={emailError}
        />
        <div className="flex flex-col gap-2">
          <TextField
            id={`${id}-senha`}
            name="password"
            type="password"
            label={A.password}
            icon="lock"
            autoComplete="current-password"
            placeholder={T.passwordPlaceholder}
            error={state.status === "invalid" && state.password ? T.passwordError : undefined}
          />
          <p className="flex justify-end">
            <Link
              href={`/recuperar-senha${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              className="min-h-tap content-center font-semibold text-link underline-offset-4 hover:underline"
            >
              {T.forgot}
            </Link>
          </p>
        </div>

        <div aria-live="polite" className="empty:hidden">
          {state.status === "wrong" && (
            <InlineAlert tone="error" title={T.wrong} role="alert">
              <p>{T.remaining(state.remaining)}</p>
            </InlineAlert>
          )}
          {state.status === "locked" && (
            <InlineAlert tone="error" title={T.wrong} role="alert">
              <p>{T.locked(formatHour(state.retryAt))}</p>
            </InlineAlert>
          )}
          {state.status === "not_confirmed" && (
            <InlineAlert tone="warn" title={T.notConfirmed} role="alert">
              <p>
                <Link
                  href={`/confirmar?estado=pendente&email=${encodeURIComponent(state.email)}`}
                  className="font-semibold text-link underline underline-offset-4"
                >
                  {T.resendConfirm}
                </Link>
              </p>
            </InlineAlert>
          )}
          {(state.status === "unavailable" || magic.status === "unavailable") && (
            <InlineAlert tone="error" title={A.unavailable} role="alert" />
          )}
          {magic.status === "sent" && (
            <InlineAlert tone="success" title={T.magicSent(magic.email)} />
          )}
          {magic.status === "rate_limited" && (
            <InlineAlert tone="warn" title={A.rateLimited} role="alert" />
          )}
        </div>

        <Button type="submit" fullWidth disabled={busy}>
          {signingIn ? T.busy : T.submit}
        </Button>

        <div className="flex flex-col gap-3 border-t border-line-subtle pt-5">
          <h2 className="type-label text-strong">{T.magicTitle}</h2>
          <p className="type-meta text-meta">{T.magicIntro}</p>
          <Button
            type="submit"
            variant="outline"
            fullWidth
            icon="mail"
            disabled={busy}
            formAction={magicAction}
          >
            {T.magicSubmit}
          </Button>
        </div>
      </form>

      {google ? (
        <form action={google}>
          <input type="hidden" name="next" value={next} />
          <Button type="submit" variant="outline" fullWidth>
            {T.google}
          </Button>
        </form>
      ) : (
        <p className="type-meta text-meta">{T.googleOff}</p>
      )}
    </div>
  );
}
