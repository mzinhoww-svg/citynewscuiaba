import type { Metadata } from "next";
import { AccountShell, Button, ConfirmEmail, EmailLinkForm, InlineAlert } from "@/components";
import { CONFIRM_TEXT as T } from "@/content/pt-BR/account";
import { parseEmail, safeNext } from "@/lib/auth/account";
import { afterLogin } from "@/lib/auth/links";
import { getReader } from "@/lib/auth/reader";
import { pageMetadata } from "@/lib/seo/metadata";
import { confirmAction, resendConfirmAction } from "./actions";

export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.checkDetail,
  path: "/confirmar",
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Confirmar e-mail (C05): sucesso, link expirado (reenviar) e já confirmado. Com `token`, o
 * leitor confirma tocando no botão; sem ele, a página explica o estado vindo de /auth/callback.
 */
export default async function ConfirmPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const state = one(sp.estado);
  const token = one(sp.token);
  const next = safeNext(one(sp.next));
  const email = parseEmail(one(sp.email)) ?? "";
  const reader = await getReader();
  const confirmedAlready = Boolean(reader?.user.email_confirmed_at);

  const resend = (
    <EmailLinkForm
      action={resendConfirmAction}
      submit={T.resend}
      busy={T.busy}
      sent={T.resent}
      defaultEmail={email}
    />
  );
  const expired = (
    <div className="flex flex-col gap-5">
      <InlineAlert tone="warn" title={T.expired} role="alert">
        <p>{T.expiredDetail}</p>
      </InlineAlert>
      {resend}
    </div>
  );
  const done = (title: string, detail: string, href: string, label: string) => (
    <div className="flex flex-col gap-5">
      <InlineAlert tone="success" title={title}>
        <p>{detail}</p>
      </InlineAlert>
      <Button href={href} fullWidth>
        {label}
      </Button>
    </div>
  );

  let body: React.ReactNode;
  if (state === "confirmado" && reader)
    body = done(T.success, T.successDetail, afterLogin(next, "email"), T.continue);
  else if (token && !confirmedAlready)
    body = (
      <ConfirmEmail
        action={confirmAction}
        token={token}
        type={one(sp.type) ?? "email"}
        continueHref={afterLogin(next, "email")}
        expired={expired}
      />
    );
  else if (confirmedAlready || state === "ja-confirmado")
    body = done(
      T.already,
      T.alreadyDetail,
      reader ? afterLogin(next, "email") : `/entrar?next=${encodeURIComponent(next)}`,
      reader ? T.continue : T.signIn,
    );
  else if (state === "expirado") body = expired;
  else
    body = (
      <div className="flex flex-col gap-5">
        <InlineAlert tone="info" title={T.check}>
          <p>{T.checkDetail}</p>
        </InlineAlert>
        {resend}
      </div>
    );

  return <AccountShell title={T.title}>{body}</AccountShell>;
}
