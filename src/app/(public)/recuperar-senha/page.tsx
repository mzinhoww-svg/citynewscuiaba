import type { Metadata } from "next";
import Link from "next/link";
import { AccountShell, EmailLinkForm, InlineAlert } from "@/components";
import { RECOVER_TEXT as T } from "@/content/pt-BR/account";
import { parseEmail } from "@/lib/auth/account";
import { pageMetadata } from "@/lib/seo/metadata";
import { recoverAction } from "./actions";

export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.intro,
  path: "/recuperar-senha",
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Recuperar senha (C04): e-mail → mensagem neutra → link para /redefinir-senha. */
export default async function RecoverPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const expired = one(sp.estado) === "expirado";
  return (
    <AccountShell
      title={T.title}
      intro={T.intro}
      footer={
        <p>
          <Link
            href="/entrar"
            className="font-semibold text-link underline underline-offset-4 hover:text-strong"
          >
            {T.back}
          </Link>
        </p>
      }
    >
      {expired && (
        <InlineAlert tone="warn" title={T.resetExpired} role="alert">
          <p>{T.resetExpiredDetail}</p>
        </InlineAlert>
      )}
      <EmailLinkForm
        action={recoverAction}
        submit={T.submit}
        busy={T.busy}
        sent={T.sent}
        sentDetail={T.sentDetail}
        defaultEmail={parseEmail(one(sp.email)) ?? ""}
      />
    </AccountShell>
  );
}
