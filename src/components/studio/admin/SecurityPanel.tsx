"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";
import {
  ADMIN_OPS_TEXT as T,
  PRIVACY_KIND_LABEL,
  PRIVACY_STATUS_LABEL,
} from "@/content/pt-BR/admin-ops";
import { ROLE_LABEL } from "@/content/pt-BR/studio";
import type { PrivacyRequestRow, SecurityOverview } from "@/lib/db/queries/admin-ops";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { EmptyState } from "../../ui/EmptyState";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { Toggle } from "../../ui/Toggle";
import { AdminStatus, AdminTable, type AdminReply } from "./AdminStatus";

export interface SecurityPanelProps {
  data: SecurityOverview;
  now: string;
  saveSettings: (i: { sessionHours: number; retentionDays: number }) => Promise<AdminReply>;
  savePrivacy: (i: {
    id?: string;
    kind?: PrivacyRequestRow["kind"];
    email?: string;
    notes?: string;
    status?: PrivacyRequestRow["status"];
  }) => Promise<AdminReply>;
  rotateKey: (i: { key: string }) => Promise<AdminReply>;
}

const S = T.security;
const KINDS = Object.entries(PRIVACY_KIND_LABEL).map(([value, label]) => ({ value, label }));
const STATUSES = Object.entries(PRIVACY_STATUS_LABEL).map(([value, label]) => ({ value, label }));

/** Segurança e privacidade (A11): políticas, pedidos LGPD com prazo, revisão de acessos e rotação de chaves. */
export function SecurityPanel({
  data,
  now,
  saveSettings,
  savePrivacy,
  rotateKey,
}: SecurityPanelProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const [status, setStatus] = useState<AdminReply | null>(null);
  const [sessionHours, setSessionHours] = useState(String(data.settings.sessionHours));
  const [retentionDays, setRetentionDays] = useState(String(data.settings.retentionDays));
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const done = (r: AdminReply) => {
    setStatus(r);
    if (r.ok) {
      setOpen(false);
      router.refresh();
    }
  };
  const nowMs = new Date(now).getTime();
  const dirty =
    Number(sessionHours) !== data.settings.sessionHours ||
    Number(retentionDays) !== data.settings.retentionDays;
  const numOk = (v: string, min: number, max: number) =>
    /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;
  const valid = numOk(sessionHours, 1, 720) && numOk(retentionDays, 30, 90);

  return (
    <div className="flex flex-col gap-10">
      <AdminStatus status={status} />

      <section
        aria-labelledby={`${uid}-pol`}
        className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-card-white p-4"
      >
        <h2 id={`${uid}-pol`} className="type-section text-strong">
          {S.settings}
        </h2>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <span id={`${uid}-2fa`} className="type-body text-strong">
              {S.require2fa}
            </span>
            <Toggle checked={false} disabled label={S.require2fa} />
          </div>
          <p role="note" className="type-meta font-medium text-warn">
            {S.require2faNotApplied}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={`${uid}-sess`}
            label={S.sessionHours}
            inputMode="numeric"
            value={sessionHours}
            onChange={(e) => setSessionHours(e.target.value)}
            hint={S.sessionHoursHint}
            error={numOk(sessionHours, 1, 720) ? undefined : T.settings.invalid}
          />
          <TextField
            id={`${uid}-ret`}
            label={S.retentionDays}
            inputMode="numeric"
            value={retentionDays}
            onChange={(e) => setRetentionDays(e.target.value)}
            hint={S.retentionDaysHint}
            error={numOk(retentionDays, 30, 90) ? undefined : T.settings.invalid}
          />
        </div>
        <div>
          <Button
            size="md"
            disabled={busy || !dirty || !valid}
            onClick={() =>
              start(async () =>
                done(
                  await saveSettings({
                    sessionHours: Number(sessionHours),
                    retentionDays: Number(retentionDays),
                  }),
                ),
              )
            }
          >
            {S.save}
          </Button>
        </div>
      </section>

      <section aria-labelledby={`${uid}-lgpd`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id={`${uid}-lgpd`} className="type-section text-strong">
              {S.privacy}
            </h2>
            <p className="type-meta text-meta">{S.privacyIntro}</p>
          </div>
          <Button size="sm" variant="outline" icon="plus" onClick={() => setOpen(true)}>
            {S.newRequest}
          </Button>
        </div>
        {data.requests.length === 0 ? (
          <EmptyState title={S.privacyEmpty} />
        ) : (
          <AdminTable
            caption={S.privacyTable}
            headers={[
              S.privacyCol.kind,
              S.privacyCol.email,
              S.privacyCol.status,
              S.privacyCol.due,
              S.privacyCol.notes,
            ]}
          >
            {data.requests.map((r) => {
              const openReq = r.status === "open" || r.status === "in_progress";
              const overdue = openReq && new Date(r.dueAt).getTime() < nowMs;
              return (
                <tr key={r.id} className="border-b border-line-subtle last:border-0">
                  <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
                    {PRIVACY_KIND_LABEL[r.kind]}
                  </th>
                  <td className="px-3 py-2 type-body text-body">{r.email}</td>
                  <td className="px-3 py-2">
                    <Select
                      id={`${uid}-st-${r.id}`}
                      name="situacao"
                      label={S.privacyCol.status}
                      options={STATUSES}
                      value={r.status}
                      onChange={(v) =>
                        start(async () =>
                          done(
                            await savePrivacy({
                              id: r.id,
                              status: v as PrivacyRequestRow["status"],
                            }),
                          ),
                        )
                      }
                      className="min-w-40"
                    />
                  </td>
                  <td className="px-3 py-2 type-body text-body">
                    {formatDate(r.dueAt)}
                    {overdue && (
                      <span className="block type-meta font-medium text-danger">{S.overdue}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 type-body text-body">{r.notes || ADMIN_TEXT.none}</td>
                </tr>
              );
            })}
          </AdminTable>
        )}
      </section>

      <section aria-labelledby={`${uid}-acc`} className="flex flex-col gap-3">
        <h2 id={`${uid}-acc`} className="type-section text-strong">
          {S.access}
        </h2>
        <p className="type-meta text-meta">{S.accessIntro}</p>
        <AdminTable
          caption={S.accessTable}
          headers={[S.accessCol.name, S.accessCol.roles, S.accessCol.last, S.accessCol.mfa]}
        >
          {data.access.map((p) => (
            <tr key={p.id} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
                {p.name}
              </th>
              <td className="px-3 py-2 type-body text-body">
                {p.roles.map((r) => ROLE_LABEL[r.role]).join(" · ") || ADMIN_TEXT.none}
              </td>
              <td className="px-3 py-2 type-body text-body">
                {p.lastSignInAt ? formatDateTime(p.lastSignInAt) : S.never}
              </td>
              <td className="px-3 py-2 type-body text-body">
                {p.mfa === null ? ADMIN_TEXT.none : p.mfa ? S.mfaOn : S.mfaOff}
              </td>
            </tr>
          ))}
        </AdminTable>
      </section>

      <section aria-labelledby={`${uid}-keys`} className="flex flex-col gap-3">
        <h2 id={`${uid}-keys`} className="type-section text-strong">
          {S.keys}
        </h2>
        <p className="type-meta text-meta">{S.keysIntro}</p>
        <AdminTable
          caption={S.keysTable}
          headers={[
            S.keysCol.key,
            S.keysCol.label,
            S.keysCol.rotated,
            S.keysCol.due,
            ADMIN_TEXT.users.col.actions,
          ]}
        >
          {data.keys.map((k) => {
            const due = k.rotatedAt
              ? new Date(k.rotatedAt).getTime() + k.rotateEveryDays * 86400_000
              : null;
            const state =
              due === null
                ? S.neverRotated
                : due < nowMs
                  ? S.overdueKey
                  : due - nowMs < 14 * 86400_000
                    ? S.dueSoon
                    : formatDate(new Date(due).toISOString());
            return (
              <tr key={k.key} className="border-b border-line-subtle last:border-0">
                <th scope="row" className="px-3 py-2 type-body font-medium text-strong">
                  <code className="font-mono text-14">{k.key}</code>
                </th>
                <td className="px-3 py-2 type-body text-body">{k.label}</td>
                <td className="px-3 py-2 type-body text-body">
                  {k.rotatedAt ? formatDateTime(k.rotatedAt) : S.neverRotated}
                  {k.rotatedBy && <span className="block type-meta text-meta">{k.rotatedBy}</span>}
                </td>
                <td className="px-3 py-2 type-body text-body">{state}</td>
                <td className="px-3 py-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => start(async () => done(await rotateKey({ key: k.key })))}
                  >
                    {S.rotate}
                  </Button>
                </td>
              </tr>
            );
          })}
        </AdminTable>
      </section>

      {open && (
        <PrivacyDialog
          busy={busy}
          onCancel={() => setOpen(false)}
          onSubmit={(v) => start(async () => done(await savePrivacy(v)))}
        />
      )}
    </div>
  );
}

function PrivacyDialog({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: { kind: PrivacyRequestRow["kind"]; email: string; notes: string }) => void;
}) {
  const D = S.dialog;
  const uid = useId().replace(/:/g, "");
  const [kind, setKind] = useState<PrivacyRequestRow["kind"]>("access");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const ready = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  return (
    <Dialog open title={D.title} onClose={onCancel}>
      <form
        className="flex flex-col gap-4 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ kind, email: email.trim(), notes: notes.trim() });
        }}
      >
        <Select
          id={`${uid}-kind`}
          name="tipo"
          label={D.kind}
          options={KINDS}
          value={kind}
          onChange={(v) => setKind(v as PrivacyRequestRow["kind"])}
        />
        <TextField
          id={`${uid}-email`}
          label={D.email}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          id={`${uid}-notes`}
          label={D.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
            {ADMIN_TEXT.cancel}
          </Button>
          <Button size="md" type="submit" disabled={!ready || busy}>
            {D.submit}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
