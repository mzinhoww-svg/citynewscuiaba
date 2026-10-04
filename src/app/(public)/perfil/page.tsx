import type { Metadata } from "next";
import Link from "next/link";
import {
  AccountInvite,
  DeleteAccount,
  ExportAccountButton,
  InlineAlert,
  LocalProfileCard,
  NewPasswordForm,
  Icon,
  PAGE_CONTAINER,
  PageHeader,
  ProfileDetailsForm,
  Button,
} from "@/components";

import { PROFILE_TEXT as T } from "@/content/pt-BR/account";
import { getReader } from "@/lib/auth/reader";
import { readAccountProfile } from "@/lib/db/account";
import { formatDayMonth, formatWhen } from "@/lib/format/date";
import { pageMetadata } from "@/lib/seo/metadata";
import { newPasswordAction } from "../redefinir-senha/actions";
import {
  cancelDeletionAction,
  exportAccountAction,
  requestDeletionAction,
  signOutAction,
  updateProfileAction,
} from "./actions";

export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.description,
  path: "/perfil",
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const DAY_MS = 86_400_000;

const SHORTCUTS = [
  { href: "/favoritos", label: T.links.favorites },
  { href: "/alertas", label: T.links.alerts },
  { href: "/privacidade/recomendacoes", label: T.links.privacy },
  { href: "/newsletter", label: T.links.newsletter },
  { href: "/app", label: T.links.app },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-line-subtle pt-6">
      <h2 id={id} className="type-section text-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Perfil (P20, UI-T14). Sem conta: o perfil deste navegador, o convite com os benefícios da
 * conta ("Criar conta para sincronizar" e "Agora não") e atalhos, no grid 8 + 4 do portal.
 * Com conta: dados, sessões, senha, exportar e excluir (vale em 7 dias).
 */
export default async function ProfilePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const reader = await getReader();
  const account = reader
    ? await readAccountProfile(reader.db, reader.user.id).catch(() => null)
    : null;
  const deletion = account?.deleteRequestedAt
    ? formatDayMonth(new Date(Date.parse(account.deleteRequestedAt) + 7 * DAY_MS).toISOString())
    : null;

  const notice =
    one(sp.senha) === "alterada"
      ? T.password.changed
      : one(sp.saiu) === "1"
        ? T.sessions.signedOut
        : one(sp.exclusao) === "cancelada"
          ? T.delete.undone
          : null;

  const loadError = Boolean(reader && !account);

  return (
    <div className={`${PAGE_CONTAINER} flex flex-col gap-6 py-8 lg:py-10`}>
      <PageHeader title={T.title} intro={<p>{T.description}</p>} />

      {notice && <InlineAlert tone="success" title={notice} />}
      {loadError && (
        <InlineAlert
          tone="error"
          title={T.loadError}
          role="alert"
          action={
            <Button href="/perfil" size="sm" variant="outline">
              {T.retry}
            </Button>
          }
        >
          <p>{T.loadErrorDetail}</p>
        </InlineAlert>
      )}
      {deletion && (
        <InlineAlert
          tone="warn"
          title={T.delete.scheduled(deletion)}
          role="none"
          action={
            <form action={cancelDeletionAction}>
              <Button type="submit" size="sm" variant="outline">
                {T.delete.undo}
              </Button>
            </form>
          }
        >
          <p>{T.delete.scheduledDetail}</p>
        </InlineAlert>
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-x-6">
        <div className="flex min-w-0 max-w-read flex-col gap-8 lg:col-span-8">
          {reader && account && (
            <Section id="perfil-conta" title={T.account.title}>
              <ProfileDetailsForm
                action={updateProfileAction}
                name={account.displayName}
                email={reader.user.email ?? ""}
                neighborhood={account.neighborhood}
              />
            </Section>
          )}

          <LocalProfileCard signedIn={Boolean(reader)} accountActions={Boolean(reader)} />

          {reader && account && (
            <>
              <Section id="perfil-sessoes" title={T.sessions.title}>
                <p className="type-body text-body">
                  <span className="font-semibold text-strong">{T.sessions.current}</span>
                  {reader.user.last_sign_in_at &&
                    ` · ${T.sessions.since(formatWhen(reader.user.last_sign_in_at))}`}
                </p>
                <p className="type-meta text-meta">{T.sessions.note}</p>
                <div className="flex flex-wrap gap-3">
                  <form action={signOutAction}>
                    <input type="hidden" name="scope" value="local" />
                    <Button type="submit" size="md" variant="outline" icon="log-out">
                      {T.sessions.signOut}
                    </Button>
                  </form>
                  <form action={signOutAction}>
                    <input type="hidden" name="scope" value="global" />
                    <Button type="submit" size="md" variant="outline">
                      {T.sessions.signOutAll}
                    </Button>
                  </form>
                </div>
              </Section>

              <Section id="perfil-senha" title={T.password.title}>
                <NewPasswordForm action={newPasswordAction} submit={T.password.submit} />
              </Section>

              <Section id="perfil-dados" title={T.data.title}>
                <p className="type-body text-body">{T.data.intro}</p>
                <ExportAccountButton action={exportAccountAction} />
              </Section>

              <Section id="perfil-excluir" title={T.delete.title}>
                {account.staff ? (
                  <p className="type-body text-body">{T.delete.staff}</p>
                ) : (
                  <>
                    <p className="type-body text-body">{T.delete.intro}</p>
                    {!deletion && <DeleteAccount action={requestDeletionAction} />}
                  </>
                )}
              </Section>
            </>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-8 lg:col-span-4">
          {!reader && <AccountInvite next="/perfil" createLabel={T.anon.create} />}
          <nav aria-labelledby="perfil-atalhos" className="flex flex-col gap-3">
            <h2 id="perfil-atalhos" className="type-section text-strong">
              {T.shortcuts}
            </h2>
            <ul className="flex flex-col">
              {SHORTCUTS.map((s) => (
                <li key={s.href} className="border-b border-line-subtle last:border-b-0">
                  <Link
                    href={s.href}
                    className="flex min-h-tap items-center justify-between py-3 type-body font-semibold text-strong hover:text-link"
                  >
                    {s.label}
                    <Icon name="chevron-right" size={20} className="text-meta" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}
