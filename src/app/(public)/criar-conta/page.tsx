import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell, SignUpForm } from "@/components";
import { SIGN_UP_TEXT as T } from "@/content/pt-BR/account";
import { safeNext } from "@/lib/auth/account";
import { getReader } from "@/lib/auth/reader";
import { pageMetadata } from "@/lib/seo/metadata";
import { signUpAction } from "./actions";

export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.intro,
  path: "/criar-conta",
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Criar conta (C03). Quem já entrou vai para o destino. */
export default async function SignUpPage({ searchParams }: { searchParams: Search }) {
  const next = safeNext(one((await searchParams).next));
  if (await getReader()) redirect(next);
  return (
    <AccountShell
      title={T.title}
      intro={T.intro}
      skipHref={next === "/perfil" ? "/" : next}
      footer={
        <p>
          {T.hasAccount}{" "}
          <Link
            href={`/entrar?next=${encodeURIComponent(next)}`}
            className="font-semibold text-link underline underline-offset-4 hover:text-strong"
          >
            {T.signIn}
          </Link>
        </p>
      }
    >
      <SignUpForm action={signUpAction} next={next} />
    </AccountShell>
  );
}
