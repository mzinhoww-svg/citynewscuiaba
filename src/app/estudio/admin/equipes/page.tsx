import type { Metadata } from "next";
import { AdminInput, AdminFlash, Button, EmptyState, Select } from "@/components";
import { TEAMS_TEXT as T } from "@/content/pt-BR/admin";
import { requireRole } from "@/lib/auth/require-role";
import { listTeams, type TeamRow } from "@/lib/admin/teams";
import { AdminLoadError } from "../load-error";
import { errorText, okText } from "../flash";
import { addMemberAction, deleteTeamAction, removeMemberAction, saveTeamAction } from "./actions";

export const metadata: Metadata = { title: "Equipes · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/equipes";
type Params = Record<string, string | string[] | undefined>;

export default async function TeamsPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("users.manage", undefined, { next: NEXT });
  const sp = await searchParams;
  let data: { teams: TeamRow[]; people: { id: string; name: string }[] } | null = null;
  try {
    data = await listTeams();
  } catch (e) {
    console.error("estudio equipes:", e instanceof Error ? e.message : e);
  }
  const ok = okText(sp.ok, {
    criada: T.created,
    salva: T.updated,
    excluida: T.deleted,
    adicionada: T.added,
    removida: T.removed,
  });
  const leadOptions = (data?.people ?? []).map((p) => ({ value: p.id, label: p.name }));
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      <AdminFlash ok={ok} error={errorText(sp.erro)} />
      <section aria-labelledby="nova-equipe" className="flex flex-col gap-4">
        <h2 id="nova-equipe" className="type-section text-strong">
          {T.createTitle}
        </h2>
        <form action={saveTeamAction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <AdminInput
            id="team-new-name"
            name="name"
            label={T.name}
            showLabel
            required
            maxLength={80}
          />
          <AdminInput
            id="team-new-desc"
            name="description"
            label={T.description}
            showLabel
            maxLength={300}
          />
          <Select
            id="team-new-lead"
            name="leadId"
            label={T.lead}
            placeholder={T.noLead}
            options={leadOptions}
          />
          <div className="flex items-end">
            <Button type="submit" size="md" icon="check">
              {T.create}
            </Button>
          </div>
        </form>
      </section>
      {data === null ? (
        <AdminLoadError href={NEXT} />
      ) : data.teams.length === 0 ? (
        <EmptyState title={T.emptyTitle} icon="users">
          {T.emptyBody}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-6">
          {data.teams.map((t) => {
            const inTeam = new Set(t.members.map((m) => m.id));
            return (
              <li
                key={t.id}
                className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-card-white p-4"
              >
                <h2 className="type-section text-strong">{t.name}</h2>
                <form
                  action={saveTeamAction}
                  className="grid grid-cols-1 items-end gap-3 md:grid-cols-4"
                >
                  <input type="hidden" name="id" value={t.id} />
                  <AdminInput
                    id={`team-${t.id}-name`}
                    name="name"
                    label={T.name}
                    showLabel
                    defaultValue={t.name}
                    required
                    maxLength={80}
                  />
                  <AdminInput
                    id={`team-${t.id}-desc`}
                    name="description"
                    label={T.description}
                    showLabel
                    defaultValue={t.description ?? ""}
                    maxLength={300}
                  />
                  <Select
                    id={`team-${t.id}-lead`}
                    name="leadId"
                    label={T.lead}
                    placeholder={T.noLead}
                    options={leadOptions}
                    defaultValue={t.leadId ?? ""}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      size="md"
                      variant="outline"
                      aria-label={T.saveNamed(t.name)}
                    >
                      {T.save}
                    </Button>
                    <Button
                      type="submit"
                      size="md"
                      variant="danger"
                      formAction={deleteTeamAction}
                      aria-label={T.delNamed(t.name)}
                    >
                      {T.del}
                    </Button>
                  </div>
                </form>
                <p className="type-meta text-meta">{T.members(t.members.length)}</p>
                {t.members.length === 0 ? (
                  <p className="type-body text-meta">{T.noMembers}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {t.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3">
                        <span className="type-body text-strong">{m.name}</span>
                        <form action={removeMemberAction}>
                          <input type="hidden" name="teamId" value={t.id} />
                          <input type="hidden" name="userId" value={m.id} />
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            aria-label={T.removeNamed(m.name, t.name)}
                          >
                            {T.remove}
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={addMemberAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="teamId" value={t.id} />
                  <Select
                    id={`team-${t.id}-add`}
                    name="userId"
                    label={`${T.member} (${t.name})`}
                    placeholder="Escolha uma pessoa"
                    options={leadOptions.filter((o) => !inTeam.has(o.value))}
                    required
                  />
                  <Button type="submit" size="md" variant="outline">
                    {T.addMember}
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
