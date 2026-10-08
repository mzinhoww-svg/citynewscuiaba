"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { ACCOUNT_TEXT as A, SIGN_UP_TEXT as T } from "@/content/pt-BR/account";
import { passwordStrength } from "@/lib/auth/password";
import { IDLE, type SignUpState } from "@/lib/auth/form-state";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { InlineAlert } from "../ui/InlineAlert";
import { TextField } from "../ui/TextField";
import { useHydratedForm } from "../ui/useHydratedForm";
import { EmailDivider, GoogleButton } from "./GoogleButton";

export interface SignUpFormProps {
  action: (state: SignUpState, form: FormData) => Promise<SignUpState>;
  /** Server Action do Google; `null` quando o provedor não está configurado (B-006). */
  google: ((form: FormData) => Promise<void>) | null;
  next: string;
}

function Check({
  id,
  name,
  label,
  checked,
  onChange,
  error,
  children,
}: {
  id: string;
  name: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  error?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex min-h-tap cursor-pointer items-start gap-3 type-body">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-erro` : undefined}
          className="mt-0.5 size-5 shrink-0 accent-(--action-primary)"
        />
        <span className="text-body">{label}</span>
      </label>
      {children}
      {error && (
        <p id={`${id}-erro`} className="flex items-start gap-1.5 type-meta text-danger">
          <Icon name="circle-alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Criar conta (C03): Google no topo quando configurado (UI-T12), divisor "ou use seu e-mail",
 * nome de exibição, e-mail, senha com força em texto, termos obrigatórios e newsletter
 * opcional. Nada além disso é pedido (spec §5.4). Sem o Google, nada dele aparece.
 */
export function SignUpForm({ action, google, next }: SignUpFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE as SignUpState);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  // O que foi digitado ou marcado antes da hidratação vale (celular lento).
  const { ref, ready } = useHydratedForm(({ text, checked }) => {
    setName((v) => text("name") ?? v);
    setEmail((v) => text("email") ?? v);
    setPassword((v) => text("password") ?? v);
    setTerms((v) => checked("terms") ?? v);
    setNewsletter((v) => checked("newsletter") ?? v);
  });
  const id = useId();
  const bad = state.status === "invalid" ? state.fields : {};
  const strength = password ? passwordStrength(password) : null;

  if (state.status === "check_email") {
    return (
      <InlineAlert tone="success" title={T.checkEmail(state.email)}>
        <p>
          <Link
            href={`/confirmar?estado=pendente&email=${encodeURIComponent(state.email)}`}
            className="font-semibold text-link underline underline-offset-4"
          >
            {T.resend}
          </Link>
        </p>
      </InlineAlert>
    );
  }

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
        action={formAction}
        noValidate
        className="flex flex-col gap-5"
        data-ready={ready ? "true" : undefined}
      >
        <input type="hidden" name="next" value={next} />
        <TextField
          id={`${id}-nome`}
          name="name"
          label={T.name}
          icon="user"
          autoComplete="nickname"
          maxLength={80}
          placeholder={T.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={bad.name ? T.nameError : undefined}
        />
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
          error={bad.email ? A.emailError : undefined}
        />
        <div className="flex flex-col gap-2">
          <TextField
            id={`${id}-senha`}
            name="password"
            type="password"
            label={A.password}
            icon="lock"
            autoComplete="new-password"
            placeholder={T.passwordPlaceholder}
            hint={T.passwordHint}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={bad.password ? T.passwordError : undefined}
          />
          <p aria-live="polite" className="type-meta text-strong">
            {strength?.text}
          </p>
        </div>
        <Check
          id={`${id}-termos`}
          name="terms"
          label={T.terms}
          checked={terms}
          onChange={setTerms}
          error={bad.terms ? T.termsError : undefined}
        >
          <p className="flex flex-wrap gap-x-4 pl-8 type-meta">
            <Link
              href="/termos"
              className="inline-flex min-h-tap items-center text-link underline underline-offset-4"
            >
              {T.termsLink}
            </Link>
            <Link
              href="/privacidade"
              className="inline-flex min-h-tap items-center text-link underline underline-offset-4"
            >
              {T.privacyLink}
            </Link>
          </p>
        </Check>
        <Check
          id={`${id}-newsletter`}
          name="newsletter"
          label={T.newsletter}
          checked={newsletter}
          onChange={setNewsletter}
        />

        <div aria-live="polite" className="empty:hidden">
          {state.status === "exists" && (
            <InlineAlert tone="error" title={T.exists} role="alert">
              <p className="flex flex-wrap gap-x-4">
                <Link
                  href={`/entrar?next=${encodeURIComponent(next)}`}
                  className="font-semibold text-link underline underline-offset-4"
                >
                  {T.signIn}
                </Link>
                <Link
                  href={`/recuperar-senha?email=${encodeURIComponent(email)}`}
                  className="font-semibold text-link underline underline-offset-4"
                >
                  {T.recover}
                </Link>
              </p>
            </InlineAlert>
          )}
          {state.status === "unavailable" && (
            <InlineAlert tone="error" title={A.unavailable} role="alert" />
          )}
          {state.status === "rate_limited" && (
            <InlineAlert tone="warn" title={A.rateLimited} role="alert" />
          )}
        </div>

        <Button type="submit" fullWidth loading={pending} loadingLabel={T.busy}>
          {T.submit}
        </Button>
      </form>
    </div>
  );
}
