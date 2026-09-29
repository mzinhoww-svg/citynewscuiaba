"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import type { TeamView } from "@/lib/db/queries/admin";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { AdminStatus, AdminTable, CheckList, type AdminReply } from "./AdminStatus";

export interface TeamsEditorProps {
  teams: TeamView[];
  people: { id: string; name: string }[];
  sections: { slug: string; name: string }[];
  save: (i: {
    id?: string;
    name: string;
    description: string;
    sections: string[];
    leadId: string | null;
    memberIds: string[];
  }) => Promise<AdminReply>;
  remove: (i: { id: string }) => Promise<AdminReply>;
}

const E = T.teams;

/** Equipes (A04): lista com responsável, editorias e integrantes; criar, editar e apagar em diálogo. */
export function TeamsEditor({ teams, people, sections, save, remove }: TeamsEditorProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [open, setOpen] = useState<TeamView | "new" | null>(null);
  const [busy, start] = useTransition();
  const done = (r: AdminReply) => {
    setStatus(r);
    if (r.ok) {
      setOpen(null);
      router.refresh();
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminStatus status={status} />
        <Button size="md" icon="plus" onClick={() => setOpen("new")}>
          {E.create}
        </Button>
      </div>
      {teams.length === 0 ? (
        <EmptyState title={E.empty} />
      ) : (
        <AdminTable
          caption={E.table}
          headers={[E.col.name, E.col.lead, E.col.sections, E.col.members, T.users.col.actions]}
        >
          {teams.map((t) => (
            <tr key={t.id} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                {t.name}
                {t.description && (
                  <span className="block type-meta font-normal text-meta">{t.description}</span>
                )}
              </th>
              <td className="px-3 py-3 type-body text-body">{t.lead?.name ?? T.none}</td>
              <td className="px-3 py-3 type-body text-body">
                {t.sections.length
                  ? t.sections.map((s) => sections.find((x) => x.slug === s)?.name ?? s).join(", ")
                  : T.none}
              </td>
              <td className="px-3 py-3 type-body text-body">
                {t.members.length ? t.members.map((m) => m.name).join(", ") : T.none}
              </td>
              <td className="px-3 py-3">
                <Button size="sm" variant="outline" onClick={() => setOpen(t)}>
                  {T.users.edit}
                </Button>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      {open && (
        <TeamDialog
          team={open === "new" ? null : open}
          people={people}
          sections={sections}
          busy={busy}
          onCancel={() => setOpen(null)}
          onSubmit={(v) => start(async () => done(await save(v)))}
          onRemove={
            open === "new"
              ? undefined
              : () => start(async () => done(await remove({ id: open.id })))
          }
        />
      )}
    </div>
  );
}

function TeamDialog({
  team,
  people,
  sections,
  busy,
  onCancel,
  onSubmit,
  onRemove,
}: {
  team: TeamView | null;
  people: { id: string; name: string }[];
  sections: { slug: string; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: Parameters<TeamsEditorProps["save"]>[0]) => void;
  onRemove?: () => void;
}) {
  const D = E.dialog;
  const uid = useId().replace(/:/g, "");
  const [name, setName] = useState(team?.name ?? "");
  const [description, setDescription] = useState(team?.description ?? "");
  const [leadId, setLeadId] = useState(team?.lead?.id ?? "");
  const [secs, setSecs] = useState<string[]>(team?.sections ?? []);
  const [members, setMembers] = useState<string[]>(team?.members.map((m) => m.id) ?? []);
  const [confirm, setConfirm] = useState(false);
  return (
    <Dialog open title={team ? D.titleEdit(team.name) : D.titleNew} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            ...(team ? { id: team.id } : {}),
            name: name.trim(),
            description: description.trim(),
            sections: secs,
            leadId: leadId || null,
            memberIds: members,
          });
        }}
      >
        <TextField
          id={`${uid}-nome`}
          label={D.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextField
          id={`${uid}-desc`}
          label={D.description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select
          id={`${uid}-lead`}
          name="responsavel"
          label={D.lead}
          options={[
            { value: "", label: D.noLead },
            ...people.map((p) => ({ value: p.id, label: p.name })),
          ]}
          value={leadId}
          onChange={setLeadId}
        />
        <CheckList
          label={D.sections}
          options={sections.map((s) => ({ value: s.slug, label: s.name }))}
          value={secs}
          onChange={setSecs}
        />
        <CheckList
          label={D.members}
          options={people.map((p) => ({ value: p.id, label: p.name }))}
          value={members}
          onChange={setMembers}
        />
        {confirm && team && (
          <p role="alert" className="type-body text-strong">
            {D.confirmRemove(team.name)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          {onRemove && (
            <Button
              size="md"
              variant="danger"
              disabled={busy}
              onClick={() => (confirm ? onRemove() : setConfirm(true))}
            >
              {D.remove}
            </Button>
          )}
          <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
            {T.cancel}
          </Button>
          <Button size="md" type="submit" disabled={name.trim().length < 2 || busy}>
            {D.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
