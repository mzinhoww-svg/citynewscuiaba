import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Button,
  Icon,
  InlineAlert,
  NewPasswordForm,
  PAGE_CONTAINER,
  PageHeader,
} from "@/components";
import { PROFILE_TEXT as T } from "@/content/pt-BR/account";
import { getReader } from "@/lib/auth/reader";
import { formatWhen } from "@/lib/format/date";
import { pageMetadata } from "@/lib/seo/metadata";
import { newPasswordAction } from "../../redefinir-senha/actions";
import { signOutAction } from "../actions";

export const metadata: Metadata = pageMetadata({
  title: T.security.title,
  documentTitle: T.security.metaTitle,
  description: T.security.passwordRowDetail,
  path: "/perfil/seguranca",
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;

/**
 * Senha e sessões (redesenho UI-PERFIL): saiu da página principal do Perfil, onde o formulário
 * de senha era a ação mais pesada da tela. Só com conta.
 */
export default async function SecurityPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const reader = await getReader();
  if (!reader) redirect("/entrar?next=%2Fperfil%2Fseguranca");
  const ended = sp.sessoes === "encerradas";
  const lastSignIn = reader.user.last_sign_in_at;

  return (
    <div className={`${PAGE_CONTAINER} py-8 lg:py-10`}>
      <div className="flex max-w-read flex-col gap-8">
        <Button href="/perfil" variant="text" size="md" icon="chevron-left" className="self-start">
          {T.back}
        </Button>
        <PageHeader title={T.security.title} />

        {ended && <InlineAlert tone="success" title={T.sessions.signedOutOthers} />}

        <section aria-labelledby="seguranca-senha" className="flex flex-col gap-4">
          <h2 id="seguranca-senha" className="type-section text-strong">
            {T.password.title}
          </h2>
          <NewPasswordForm action={newPasswordAction} submit={T.password.submit} />
          <p className="type-meta text-meta">{T.password.note}</p>
        </section>

        <section
          id="sessoes"
          aria-labelledby="seguranca-sessoes"
          className="flex scroll-mt-8 flex-col gap-4 border-t border-line-subtle pt-6"
        >
          <h2 id="seguranca-sessoes" className="type-section text-strong">
            {T.sessions.title}
          </h2>
          <div className="flex items-center gap-3.5 rounded-md border border-line-subtle bg-card-white px-4 py-3">
            <Icon name="users" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-16 font-medium text-strong">{T.sessions.current}</span>
              {lastSignIn && (
                <span className="text-14 text-meta">
                  {T.sessions.since(formatWhen(lastSignIn))}
                </span>
              )}
            </div>
            <span className="rounded-pill border border-service px-2.5 py-0.5 text-13 font-semibold text-service">
              {T.sessions.inUse}
            </span>
          </div>
          <form action={signOutAction}>
            <input type="hidden" name="scope" value="others" />
            <Button type="submit" variant="outline" fullWidth>
              {T.sessions.signOutOthers}
            </Button>
          </form>
          <p className="type-meta text-meta">{T.sessions.othersNote}</p>
        </section>
      </div>
    </div>
  );
}
