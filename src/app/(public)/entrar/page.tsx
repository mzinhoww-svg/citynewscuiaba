import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell, InlineAlert, SignInForm } from "@/components";
import { SIGN_IN_TEXT as T } from "@/content/pt-BR/account";
import { safeNext } from "@/lib/auth/account";
import { getReader, googleEnabled } from "@/lib/auth/reader";
import { pageMetadata } from "@/lib/seo/metadata";
import { googleAction, magicLinkAction, signInAction } from "./actions";

export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.intro,
  path: "/entrar",
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Entrar (C02). Quem já entrou vai para o destino; quem chegou do Estúdio sem permissão vê o
 * motivo e pode trocar de conta. "Continuar sem login" sempre visível.
 */
export default async function SignInPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const next = safeNext(one(sp.next));
  const noPermission = one(sp.motivo) === "sem-permissao";
  if (!noPermission && (await getReader())) redirect(next);
  const skip = next.startsWith("/estudio") ? "/" : next === "/perfil" ? "/" : next;

  return (
    <AccountShell
      title={T.title}
      intro={T.intro}
      skipHref={skip}
      footer={
        <p>
          {T.noAccount}{" "}
          <Link
            href={`/criar-conta?next=${encodeURIComponent(next)}`}
            className="font-semibold text-link underline underline-offset-4 hover:text-strong"
          >
            {T.create}
          </Link>
        </p>
      }
    >
      {noPermission && <InlineAlert tone="warn" title={T.noPermission} role="alert" />}
      <SignInForm
        signIn={signInAction}
        magicLink={magicLinkAction}
        google={googleEnabled() ? googleAction : null}
        next={next}
      />
    </AccountShell>
  );
}
