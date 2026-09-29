import type { Metadata } from "next";
import { AdminFlash, AdminTable, Button, EmptyState, Select, TextField } from "@/components";
import { USERS_TEXT as T } from "@/content/pt-BR/admin";
import { ROLE_LABEL } from "@/content/pt-BR/studio";
import { ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/require-role";
import { listUsers, type InviteRow, type UserRow } from "@/lib/admin/users";
import { formatDateTime } from "@/lib/format/date";
import { AdminLoadError } from "../load-error";
import { errorText, okText } from "../flash";
import { inviteUserAction, revokeInviteAction } from "./actions";

export const metadata: Metadata = { title: "Usuários · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/usuarios";
const ROLE_OPTIONS = ROLES.filter((r) => r !== "admin").map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
}));
type Params = Record<string, string | string[] | undefined>;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("users.manage", undefined, { next: NEXT });
  const sp = await searchParams;
  let data: { people: UserRow[]; invites: InviteRow[] } | null = null;
  try {
    data = await listUsers();
  } catch (e) {
    console.error("estudio usuários:", e instanceof Error ? e.message : e);
  }
  const ok = okText(sp.ok, { convite: T.invited, cancelado: T.revoked });
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      <AdminFlash ok={ok} error={errorText(sp.erro)} />
      {ok === T.invited && <p className="type-meta text-meta">{T.invitedNote}</p>}

      <section aria-labelledby="convidar" className="flex flex-col gap-4">
        <h2 id="convidar" className="type-section text-strong">
          {T.inviteTitle}
        </h2>
        <form action={inviteUserAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            id="invite-email"
            name="email"
            type="email"
            label={T.email}
            hint={T.emailHint}
            autoComplete="off"
            required
          />
          <Select
            id="invite-role"
            name="role"
            label={T.role}
            options={ROLE_OPTIONS}
            defaultValue="jornalista"
            hint={T.inviteAdminNote}
          />
          <TextField
            id="invite-sections"
            name="sections"
            label={T.sections}
            placeholder="cidade, servicos"
          />
          <div className="flex items-end">
            <Button type="submit" size="md" icon="mail">
              {T.invite}
            </Button>
          </div>
        </form>
      </section>

      {data === null ? (
        <AdminLoadError href={NEXT} />
      ) : (
        <>
          <section aria-labelledby="convites" className="flex flex-col gap-4">
            <h2 id="convites" className="type-section text-strong">
              {T.invitesTitle}
            </h2>
            {data.invites.length === 0 ? (
              <p className="type-body text-meta">{T.noInvites}</p>
            ) : (
              <AdminTable
                caption={T.invitesCaption}
                columns={[T.colEmail, T.colInvitedRole, T.colInvitedAt, T.colStatus, ""]}
              >
                {data.invites.map((i) => (
                  <tr key={i.id} className="border-b border-line-subtle last:border-b-0">
                    <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                      {i.email}
                    </th>
                    <td className="px-3 py-3 type-body">{ROLE_LABEL[i.role]}</td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {formatDateTime(i.createdAt)}
                    </td>
                    <td className="px-3 py-3 type-body">{T.pending}</td>
                    <td className="px-3 py-3">
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="id" value={i.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          aria-label={T.revokeNamed(i.email)}
                        >
                          {T.revoke}
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </section>

          <section aria-labelledby="pessoas" className="flex flex-col gap-4">
            <h2 id="pessoas" className="type-section text-strong">
              {T.peopleTitle}
            </h2>
            {data.people.length === 0 ? (
              <EmptyState title={T.emptyTitle} icon="users" as="h3">
                {T.emptyBody}
              </EmptyState>
            ) : (
              <AdminTable
                caption={T.peopleCaption}
                columns={[T.colName, T.colEmail, T.colRoles, T.colLastAccess]}
              >
                {data.people.map((p) => (
                  <tr key={p.id} className="border-b border-line-subtle align-top last:border-b-0">
                    <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                      {p.name}
                    </th>
                    <td className="px-3 py-3 type-body">{p.email ?? "—"}</td>
                    <td className="px-3 py-3 type-body">
                      {p.roles.length === 0
                        ? T.noRoles
                        : p.roles.map((r) => ROLE_LABEL[r.role]).join(", ")}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {p.lastSignInAt ? formatDateTime(p.lastSignInAt) : T.never}
                    </td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </section>
        </>
      )}
    </section>
  );
}
