import type { Metadata } from "next";
import {
  AccountInvite,
  BrowserDataDetails,
  BrowserExportRow,
  BrowserLossNote,
  Button,
  EditProfile,
  ExportAccountRow,
  InlineAlert,
  ListRow,
  PAGE_CONTAINER,
  PageHeader,
  ProfileActivityRows,
  ProfileGroup,
  ProfileIdentity,
} from "@/components";

import { PROFILE_TEXT as T } from "@/content/pt-BR/account";
import { getReader } from "@/lib/auth/reader";
import { readAccountProfile } from "@/lib/db/account";
import { formatDayMonth, formatWhen } from "@/lib/format/date";
import { pageMetadata } from "@/lib/seo/metadata";
import {
  cancelDeletionAction,
  exportAccountAction,
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

/**
 * Perfil (P20, UI-T14, redesenho UI-PERFIL): lista de ajustes por frequência de uso. Com conta:
 * identidade e "Editar perfil" (folha), Seu CityNews (contagens), Preferências, Segurança (senha
 * e sessões em `/perfil/seguranca`), Seus dados (exportação única, dados do navegador e
 * exclusão em `/perfil/excluir`) e "Sair da conta". Sem conta: o perfil deste navegador, o
 * convite com "Agora não" e os mesmos grupos que funcionam sem cadastro.
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
  const lastSignIn = reader?.user.last_sign_in_at;

  return (
    <div className={`${PAGE_CONTAINER} py-8 lg:py-10`}>
      <div className="flex max-w-read flex-col gap-8">
        <PageHeader title={T.title} />

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

        {reader && account && (
          <ProfileIdentity
            name={account.displayName}
            email={reader.user.email ?? ""}
            neighborhood={account.neighborhood}
          >
            <EditProfile
              action={updateProfileAction}
              name={account.displayName}
              email={reader.user.email ?? ""}
              neighborhood={account.neighborhood}
            />
          </ProfileIdentity>
        )}

        {!reader && (
          <>
            <section aria-labelledby="perfil-local" className="flex flex-col gap-2">
              <h2 id="perfil-local" className="type-section text-strong">
                {T.anon.title}
              </h2>
              <p className="type-body text-body">{T.anon.intro}</p>
            </section>
            <AccountInvite next="/perfil" createLabel={T.anon.create} />
          </>
        )}

        <ProfileGroup
          id="perfil-atividade"
          as="nav"
          title={T.groups.activity}
          footer={!reader && <BrowserLossNote />}
        >
          <ProfileActivityRows />
        </ProfileGroup>

        <ProfileGroup id="perfil-preferencias" as="nav" title={T.groups.preferences}>
          <ListRow
            icon="shield"
            label={T.links.privacy}
            href="/privacidade/recomendacoes"
            bordered={false}
          />
          <ListRow icon="mail" label={T.links.newsletter} href="/newsletter" bordered={false} />
        </ProfileGroup>

        {reader && (
          <ProfileGroup id="perfil-seguranca" as="nav" title={T.groups.security}>
            <ListRow
              icon="lock"
              label={T.security.passwordRow}
              description={T.security.passwordRowDetail}
              href="/perfil/seguranca"
              bordered={false}
            />
            <ListRow
              icon="users"
              label={T.sessions.title}
              description={
                lastSignIn
                  ? `${T.sessions.current} · ${T.sessions.since(formatWhen(lastSignIn))}`
                  : T.sessions.current
              }
              href="/perfil/seguranca#sessoes"
              bordered={false}
            />
          </ProfileGroup>
        )}

        <ProfileGroup id="perfil-dados" title={T.groups.data}>
          {reader ? <ExportAccountRow action={exportAccountAction} /> : <BrowserExportRow />}
          <BrowserDataDetails signedIn={Boolean(reader)} />
          {account &&
            (account.staff ? (
              <ListRow
                icon="trash-2"
                label={T.delete.title}
                description={T.delete.staff}
                trailing={null}
                bordered={false}
              />
            ) : deletion ? (
              <ListRow
                icon="trash-2"
                label={T.delete.title}
                description={T.delete.scheduledRow(deletion)}
                trailing={null}
                bordered={false}
              />
            ) : (
              <ListRow
                icon="trash-2"
                label={T.delete.title}
                href="/perfil/excluir"
                danger
                bordered={false}
              />
            ))}
        </ProfileGroup>

        {reader && (
          <form action={signOutAction} className="flex flex-col gap-2">
            <input type="hidden" name="scope" value="local" />
            <Button type="submit" variant="outline" icon="log-out" fullWidth>
              {T.sessions.signOut}
            </Button>
            <p className="text-center type-meta text-meta">{T.sessions.signOutNote}</p>
          </form>
        )}

        <ListRow icon="download" label={T.links.app} href="/app" />
      </div>
    </div>
  );
}
