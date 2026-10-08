"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { ROLE_LABEL } from "@/content/pt-BR/studio";
import { SECTION_SCOPED_ROLES } from "@/lib/admin/roles";
import { ROLES, type Role, type RoleGrant } from "@/lib/auth/permissions";
import type { StaffMember } from "@/lib/db/queries/admin";
import { formatDateTime } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { AdminStatus, AdminTable, CheckList, type AdminReply } from "./AdminStatus";

export interface StaffTableProps {
  staff: StaffMember[];
  sections: { slug: string; name: string }[];
  currentUserId: string;
  invite: (i: {
    name: string;
    email: string;
    role: Role;
    sections: string[];
  }) => Promise<AdminReply>;
  setRoles: (i: {
    userId: string;
    roles: RoleGrant[];
    justification: string;
  }) => Promise<AdminReply>;
}

type RolesChange = { roles: RoleGrant[]; justification: string };

const U = T.users;
const C = T.confirm;
const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));
const inviteRoles = roleOptions.filter((r) => r.value !== "admin");

/**
 * Usuários (A02): tabela da equipe com papéis, situação ("Convite pendente" até o primeiro
 * acesso) e ações; convite por e-mail e edição de papéis em diálogos. Salvar papéis é uma ação só
 * (item 61, A-150; A-128): o banco registra o pedido com quem pediu e aprovou, aplica e audita na
 * mesma transação, então não sobra pedido "aprovado, falta aplicar". Conceder ou revogar
 * administração pede confirmação com o nome da pessoa e o efeito (item 24) antes de salvar.
 */
export function StaffTable({ staff, sections, currentUserId, invite, setRoles }: StaffTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [confirming, setConfirming] = useState<{
    kind: "grant" | "revoke";
    person: StaffMember;
    change: RolesChange;
  } | null>(null);
  const [busy, start] = useTransition();

  const done = (r: AdminReply) => {
    setStatus(r);
    setConfirming(null);
    if (r.ok) {
      setInviting(false);
      setEditing(null);
      router.refresh();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminStatus status={status} />
        <Button size="md" icon="plus" onClick={() => setInviting(true)}>
          {U.invite}
        </Button>
      </div>
      {staff.length === 0 ? (
        <EmptyState title={U.empty} />
      ) : (
        <AdminTable
          caption={U.table}
          headers={[U.col.name, U.col.email, U.col.roles, U.col.status, U.col.actions]}
        >
          {staff.map((p) => (
            <tr key={p.id} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                {p.name}
              </th>
              <td className="px-3 py-3 type-body text-body">{p.email ?? T.none}</td>
              <td className="px-3 py-3 type-body text-body">
                {p.roles.length === 0
                  ? T.none
                  : p.roles
                      .map((r) =>
                        r.sections.length
                          ? `${ROLE_LABEL[r.role]} (${r.sections.join(", ")})`
                          : ROLE_LABEL[r.role],
                      )
                      .join(" · ")}
              </td>
              <td className="px-3 py-3 type-body text-body">
                {p.pendingInvite ? (
                  <span className="font-medium text-warn">{U.pending}</span>
                ) : (
                  <span>
                    {U.active}
                    {p.lastSignInAt && (
                      <span className="block type-meta text-meta">
                        {formatDateTime(p.lastSignInAt)}
                      </span>
                    )}
                  </span>
                )}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  {p.id !== currentUserId && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                      {U.edit}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      {confirming && (
        <ConfirmDialog
          open
          pending={busy}
          {...(confirming.kind === "revoke"
            ? {
                destructive: true,
                title: C.revokeTitle(confirming.person.name),
                body: C.revokeEffect(confirming.person.name),
                confirmLabel: C.revokeConfirm(confirming.person.name),
              }
            : {
                title: C.grantTitle(confirming.person.name),
                body: C.grantEffect(confirming.person.name),
                confirmLabel: C.grantConfirm(confirming.person.name),
              })}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            const { person, change } = confirming;
            start(async () => done(await setRoles({ userId: person.id, ...change })));
          }}
        />
      )}
      {inviting && (
        <InviteDialog
          sections={sections}
          busy={busy}
          onCancel={() => setInviting(false)}
          onSubmit={(v) => start(async () => done(await invite(v)))}
        />
      )}
      {editing && (
        <RolesDialog
          person={editing}
          sections={sections}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSubmit={(v) => {
            const hadAdmin = editing.roles.some((r) => r.role === "admin");
            const wantsAdmin = v.roles.some((r) => r.role === "admin");
            if (hadAdmin !== wantsAdmin)
              setConfirming({ kind: wantsAdmin ? "grant" : "revoke", person: editing, change: v });
            else start(async () => done(await setRoles({ userId: editing.id, ...v })));
          }}
        />
      )}
    </div>
  );
}

function InviteDialog({
  sections,
  busy,
  onCancel,
  onSubmit,
}: {
  sections: { slug: string; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { name: string; email: string; role: Role; sections: string[] }) => void;
}) {
  const D = U.inviteDialog;
  const uid = useId().replace(/:/g, "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("jornalista");
  const [secs, setSecs] = useState<string[]>([]);
  const scoped = SECTION_SCOPED_ROLES.includes(role);
  const ready =
    name.trim().length >= 2 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) &&
    (!scoped || secs.length > 0);
  return (
    <Dialog open title={D.title} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name: name.trim(), email: email.trim(), role, sections: scoped ? secs : [] });
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
          id={`${uid}-email`}
          label={D.email}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Select
          id={`${uid}-papel`}
          name="papel"
          label={D.role}
          options={inviteRoles}
          value={role}
          onChange={(v) => setRole(v as Role)}
        />
        {scoped && (
          <CheckList
            label={D.sections}
            options={sections.map((s) => ({ value: s.slug, label: s.name }))}
            value={secs}
            onChange={setSecs}
          />
        )}
        <p className="type-meta text-meta">{D.hint}</p>
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
            {T.cancel}
          </Button>
          <Button size="md" type="submit" disabled={!ready || busy}>
            {D.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function RolesDialog({
  person,
  sections,
  busy,
  onCancel,
  onSubmit,
}: {
  person: StaffMember;
  sections: { slug: string; name: string }[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: RolesChange) => void;
}) {
  const D = U.rolesDialog;
  const uid = useId().replace(/:/g, "");
  const [roles, setRolesSel] = useState<string[]>(person.roles.map((r) => r.role));
  const [secs, setSecs] = useState<string[]>(
    person.roles.find((r) => r.role === "editor")?.sections ?? [],
  );
  const [justification, setJustification] = useState("");
  const hadAdmin = person.roles.some((r) => r.role === "admin");
  // Conceder ou revogar administração pede justificativa (fica no pedido registrado).
  const adminChanges = roles.includes("admin") !== hadAdmin;
  const editor = roles.includes("editor");
  const ready = (!editor || secs.length > 0) && (!adminChanges || justification.trim().length > 0);
  return (
    <Dialog open title={D.title(person.name)} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            roles: roles
              .filter((r): r is Role => (ROLES as readonly string[]).includes(r))
              .map((role) => ({ role, sections: role === "editor" ? secs : [] })),
            justification: justification.trim(),
          });
        }}
      >
        <p className="type-meta text-meta">{D.hint}</p>
        <CheckList label={U.col.roles} options={roleOptions} value={roles} onChange={setRolesSel} />
        {editor && (
          <CheckList
            label={U.inviteDialog.sections}
            options={sections.map((s) => ({ value: s.slug, label: s.name }))}
            value={secs}
            onChange={setSecs}
          />
        )}
        {editor && secs.length === 0 && (
          <p role="alert" className="type-meta text-danger">
            {D.editorNeedsSection}
          </p>
        )}
        {adminChanges && (
          <TextField
            id={`${uid}-just`}
            label={D.justification}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            hint={D.justificationRequired}
          />
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
            {T.cancel}
          </Button>
          <Button size="md" type="submit" disabled={!ready || busy}>
            {D.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
