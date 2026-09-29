import type { Metadata } from "next";
import {
  AdminInput,
  AdminFlash,
  AdminTable,
  Button,
  InlineAlert,
  Select,
  TextField,
} from "@/components";
import { ROLES_TEXT as T } from "@/content/pt-BR/admin";
import { ROLE_LABEL } from "@/content/pt-BR/studio";
import { ROLES } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/require-role";
import { listUsers, roleHistory, type RoleHistoryRow, type UserRow } from "@/lib/admin/users";
import { formatDateTime } from "@/lib/format/date";
import { AdminLoadError } from "../load-error";
import { errorText, okText } from "../flash";
import { grantRoleAction, revokeRoleAction, saveSectionsAction } from "./actions";

export const metadata: Metadata = { title: "Papéis · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/papeis";
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
type Params = Record<string, string | string[] | undefined>;

function historyText(r: RoleHistoryRow): string {
  const verb = T.history[r.action] ?? r.action;
  const role =
    typeof r.details.role === "string"
      ? ROLE_LABEL[r.details.role as keyof typeof ROLE_LABEL]
      : null;
  const who = r.targetName ?? (typeof r.details.email === "string" ? r.details.email : null);
  const outcome = r.details.outcome === "requested" ? " (pedido de aprovação)" : "";
  return [verb, role, who ? `· ${who}` : null].filter(Boolean).join(" ") + outcome;
}

export default async function RolesPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("users.manage", undefined, { next: NEXT });
  const sp = await searchParams;
  let data: { people: UserRow[]; history: RoleHistoryRow[] } | null = null;
  try {
    const [{ people }, history] = await Promise.all([listUsers(), roleHistory()]);
    data = { people, history };
  } catch (e) {
    console.error("estudio papéis:", e instanceof Error ? e.message : e);
  }
  const ok = okText(sp.ok, {
    granted: T.granted,
    requested: T.requested,
    waiting: T.waiting,
    revogado: T.revokedDone,
    secoes: T.sectionsDone,
  });
  const staff = data?.people.filter((p) => p.roles.length > 0) ?? [];
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      <AdminFlash ok={ok} error={errorText(sp.erro)} />
      {(sp.ok === "requested" || sp.ok === "waiting") && (
        <InlineAlert
          tone="info"
          role="status"
          action={
            <Button href="/estudio/control/aprovacoes" size="sm" variant="outline">
              {T.approvalsLink}
            </Button>
          }
        >
          {T.errors.twoPerson}
        </InlineAlert>
      )}
      {data === null ? (
        <AdminLoadError href={NEXT} />
      ) : (
        <>
          <section aria-labelledby="conceder" className="flex flex-col gap-4">
            <h2 id="conceder" className="type-section text-strong">
              {T.grantTitle}
            </h2>
            <form action={grantRoleAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                id="grant-user"
                name="userId"
                label={T.person}
                placeholder="Escolha uma pessoa"
                options={data.people.map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.email ? ` (${p.email})` : ""}`,
                }))}
                required
              />
              <Select
                id="grant-role"
                name="role"
                label={T.role}
                options={ROLE_OPTIONS}
                defaultValue="jornalista"
              />
              <TextField
                id="grant-sections"
                name="sections"
                label={T.sections}
                placeholder="cidade, servicos"
              />
              <TextField id="grant-justification" name="justification" label={T.justification} />
              <div className="md:col-span-2">
                <Button type="submit" size="md" icon="check">
                  {T.grant}
                </Button>
              </div>
            </form>
          </section>

          <section aria-labelledby="por-pessoa" className="flex flex-col gap-4">
            <h2 id="por-pessoa" className="type-section text-strong">
              {T.personCaption}
            </h2>
            {staff.length === 0 ? (
              <p className="type-body text-meta">Ninguém tem papel ainda.</p>
            ) : (
              <AdminTable caption={T.personCaption} columns={[T.colPerson, T.colRoles]} wide>
                {staff.map((p) => (
                  <tr key={p.id} className="border-b border-line-subtle align-top last:border-b-0">
                    <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                      {p.name}
                      <span className="block type-meta font-normal text-meta">{p.email}</span>
                    </th>
                    <td className="px-3 py-3">
                      <ul className="flex flex-col gap-3">
                        {p.roles.map((r) => (
                          <li key={r.role} className="flex flex-wrap items-end gap-3">
                            <span className="min-w-36 type-body font-semibold text-strong">
                              {ROLE_LABEL[r.role]}
                            </span>
                            <form
                              action={saveSectionsAction}
                              className="flex flex-wrap items-end gap-2"
                            >
                              <input type="hidden" name="userId" value={p.id} />
                              <input type="hidden" name="role" value={r.role} />
                              <AdminInput
                                id={`sec-${p.id}-${r.role}`}
                                name="sections"
                                label={T.sectionsNamed(p.name, ROLE_LABEL[r.role])}
                                defaultValue={r.sections.join(", ")}
                                placeholder="todas as editorias"
                              />
                              <Button
                                type="submit"
                                size="sm"
                                variant="outline"
                                aria-label={T.saveSectionsNamed(p.name, ROLE_LABEL[r.role])}
                              >
                                {T.saveSections}
                              </Button>
                            </form>
                            <form action={revokeRoleAction}>
                              <input type="hidden" name="userId" value={p.id} />
                              <input type="hidden" name="role" value={r.role} />
                              <Button
                                type="submit"
                                size="sm"
                                variant="danger"
                                aria-label={T.revokeNamed(p.name, ROLE_LABEL[r.role])}
                              >
                                {T.revoke}
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </AdminTable>
            )}
          </section>

          <section aria-labelledby="historico" className="flex flex-col gap-4">
            <h2 id="historico" className="type-section text-strong">
              {T.historyTitle}
            </h2>
            {data.history.length === 0 ? (
              <p className="type-body text-meta">{T.noHistory}</p>
            ) : (
              <AdminTable caption={T.historyCaption} columns={[T.colWhen, T.colWho, T.colWhat]}>
                {data.history.map((h) => (
                  <tr key={h.id} className="border-b border-line-subtle last:border-b-0">
                    <td className="px-3 py-3 type-body tabular-nums">{formatDateTime(h.at)}</td>
                    <td className="px-3 py-3 type-body">{h.actorName}</td>
                    <td className="px-3 py-3 type-body">{historyText(h)}</td>
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
