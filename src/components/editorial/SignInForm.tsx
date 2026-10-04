"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { ACCOUNT_TEXT as A, SIGN_IN_TEXT as T } from "@/content/pt-BR/account";
import { IDLE, type EmailLinkState, type SignInState } from "@/lib/auth/form-state";
import { formatHour } from "@/lib/format/date";
import { Button } from "../ui/Button";
import { EmailDivider, GoogleButton } from "./GoogleButton";
import { InlineAlert } from "../ui/InlineAlert";
import { TextField } from "../ui/TextField";
import { useHydratedForm } from "../ui/useHydratedForm";

export interface SignInFormProps {
  signIn: (state: SignInState, form: FormData) => Promise<SignInState>;
  magicLink: (state: EmailLinkState, form: FormData) => Promise<EmailLinkState>;
  /** Server Action do Google; `null` quando o provedor não está configurado (B-006). */
  google: ((form: FormData) => Promise<void>) | null;
  next: string;
}

/**
 * Entrar (C02, UI-T12): Google no topo quando configurado, divisor "ou use seu e-mail", e-mail e
 * senha, Entrar, e "Esqueci a senha" ao lado de "Entrar sem senha" (link por e-mail no mesmo
 * campo). Sem o Google, o formulário de e-mail ocupa o espaço, sem frase de indisponível. Erro
 * genérico com tentativas restantes; bloqueio de 15 min explicado com alternativas. O e-mail
 * digitado nunca se perde.
 */
export function SignInForm({ signIn, magicLink, google, next }: SignInFormProps) {
  const [state, signInAction, signingIn] = useActionState(signIn, IDLE as SignInState);
  const [magic, magicAction, sending] = useActionState(magicLink, IDLE as EmailLinkState);
  const [email, setEmail] = useState("");
  // E-mail digitado antes da hidratação (celular lento) não se perde ao enviar.
  const { ref, ready } = useHydratedForm(({ text }) => setEmail((v) => text("email") ?? v));
  const id = useId();
  const busy = signingIn || sending;

  const emailError =
    (state.status === "invalid" && state.email) || magic.status === "invalid"
      ? A.emailError
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      {google && (
        <>
          <GoogleButton action={google} next={next} />
          <EmailDivider />
        </>
      )}
      <form
        ref={ref}
        action={signInAction}
        noValidate
        className="flex flex-col gap-5"
        data-ready={ready ? "true" : undefined}
      >
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

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <Link
            href={`/recuperar-senha${email ? `?email=${encodeURIComponent(email)}` : ""}`}
            className="min-h-tap content-center font-semibold text-link underline-offset-4 hover:underline"
          >
            {T.forgot}
          </Link>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            icon="mail"
            disabled={busy}
            formAction={magicAction}
          >
            {T.magicSubmit}
          </Button>
        </div>
      </form>
    </div>
  );
}
