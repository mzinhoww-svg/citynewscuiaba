"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { clockTime } from "@/content/pt-BR/sources-admin";
import { PUSH_ADMIN_TEXT, PUSH_SETTINGS_TEXT as T } from "@/content/pt-BR/notifications-admin";
import type { PendingResume, PushSettingsView, PushTemplate } from "@/lib/db/queries/push-admin";
import { BODY_MAX, TITLE_MAX } from "@/lib/push/text";
import type { ActionFn, ActionState } from "@/lib/sources/action-state";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Icon } from "../../ui/Icon";
import { InlineAlert } from "../../ui/InlineAlert";
import {
  ActionMessage,
  CONTROL_CLASS,
  FieldShell,
  SelectField,
  TextInput,
} from "../sources/fields";
import { PauseDialog } from "./PauseDialog";

export interface PushSettingsFormProps {
  settings: PushSettingsView;
  pendingResume: PendingResume | null;
  currentUserId: string;
  /** `push.approve`: pode aprovar a retomada (inclusive a que a própria pessoa pediu, A-128). */
  canApprove: boolean;
  actions: {
    save: ActionFn;
    pause: ActionFn;
    requestResume: ActionFn;
    approveResume: ActionFn;
  };
  className?: string;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const hourOptions = (a: number, b: number) =>
  range(a, b).map((h) => ({ value: String(h), label: T.hour(h) }));

/**
 * Configurações de A09 (spec §10.5): limite diário (1–3), silêncio (18–22h / 7–10h, sempre
 * contém 22h–7h), até 20 modelos com `{titulo}` e `{linha_fina}`, contingência (pausar com
 * PAUSAR digitado; retomar vale na hora para quem pode aprovar; senão vira pedido) e estado das chaves VAPID (só nomes).
 */
export function PushSettingsForm({
  settings,
  pendingResume,
  currentUserId,
  canApprove,
  actions,
  className,
}: PushSettingsFormProps) {
  const router = useRouter();
  const uid = useId().replace(/:/g, "");
  const [dailyLimit, setDailyLimit] = useState(String(settings.dailyLimit));
  const [quietStart, setQuietStart] = useState(String(settings.quietStart));
  const [quietEnd, setQuietEnd] = useState(String(settings.quietEnd));
  const [templates, setTemplates] = useState<PushTemplate[]>(settings.templates);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ActionState | null>(null);

  const [pauseOpen, setPauseOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeReason, setResumeReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [contingency, setContingency] = useState<ActionState | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  const closeDialogs = () => {
    setPauseOpen(false);
    setResumeOpen(false);
    setDialogError(null);
    if (trigger) setTimeout(() => trigger.focus(), 0);
  };

  async function run(action: ActionFn, form: FormData): Promise<ActionState> {
    try {
      return await action(form);
    } catch {
      return { ok: false, message: PUSH_ADMIN_TEXT.errors.unavailable };
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const form = new FormData();
    form.set("dailyLimit", dailyLimit);
    form.set("quietStart", quietStart);
    form.set("quietEnd", quietEnd);
    form.set("templates", JSON.stringify(templates));
    if (reason.trim()) form.set("reason", reason.trim());
    setSaving(true);
    const r = await run(actions.save, form);
    setSaving(false);
    setResult(r);
    setErrors(r.ok ? {} : (r.fieldErrors ?? {}));
    if (r.ok) router.refresh();
  }

  async function pause(v: { reason: string; typed: string }) {
    const form = new FormData();
    form.set("reason", v.reason);
    form.set("confirm", v.typed);
    setBusy(true);
    const r = await run(actions.pause, form);
    setBusy(false);
    if (!r.ok) {
      setDialogError(r.message);
      return;
    }
    closeDialogs();
    setContingency(r);
    router.refresh();
  }

  async function requestResume() {
    const form = new FormData();
    form.set("reason", resumeReason.trim());
    setBusy(true);
    const r = await run(actions.requestResume, form);
    setBusy(false);
    if (!r.ok) {
      setDialogError(r.message);
      return;
    }
    closeDialogs();
    setResumeReason("");
    setContingency(r);
    router.refresh();
  }

  async function approveResume() {
    if (!pendingResume) return;
    const form = new FormData();
    form.set("approvalId", pendingResume.id);
    setBusy(true);
    const r = await run(actions.approveResume, form);
    setBusy(false);
    setContingency(r);
    if (r.ok) router.refresh();
  }

  const setTemplate = (i: number, patch: Partial<PushTemplate>) =>
    setTemplates((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  const paused = settings.paused;

  return (
    <div className={cx("flex flex-col gap-8", className)}>
      <form onSubmit={save} noValidate className="flex flex-col gap-6">
        <section aria-labelledby={`${uid}-limites`} className="flex flex-col gap-4">
          <h2 id={`${uid}-limites`} className="type-section text-strong">
            {T.limits}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              id={`${uid}-limite`}
              name="dailyLimit"
              label={T.dailyLimit}
              value={dailyLimit}
              onChange={setDailyLimit}
              options={[1, 2, 3].map((n) => ({ value: String(n), label: String(n) }))}
              hint={T.dailyLimitHint}
              error={errors.dailyLimit}
            />
            <SelectField
              id={`${uid}-inicio`}
              name="quietStart"
              label={T.quietStart}
              value={quietStart}
              onChange={setQuietStart}
              options={hourOptions(18, 22)}
              hint={T.quietHint}
              error={errors.quietStart}
            />
            <SelectField
              id={`${uid}-fim`}
              name="quietEnd"
              label={T.quietEnd}
              value={quietEnd}
              onChange={setQuietEnd}
              options={hourOptions(7, 10)}
              hint={T.quietHint}
              error={errors.quietEnd}
            />
          </div>
        </section>

        <section aria-labelledby={`${uid}-modelos`} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`${uid}-modelos`} className="type-section text-strong">
              {T.templates}
            </h2>
            <p className="type-meta text-meta">{T.templatesHint}</p>
          </div>
          {templates.length === 0 && <p className="type-body text-meta">{T.templatesEmpty}</p>}
          <ul className="flex flex-col gap-4">
            {templates.map((t, i) => (
              <li
                key={i}
                aria-label={T.templateN(i + 1)}
                className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextInput
                    id={`${uid}-m${i}-nome`}
                    label={T.templateName}
                    value={t.name}
                    onChange={(v) => setTemplate(i, { name: v })}
                  />
                  <TextInput
                    id={`${uid}-m${i}-titulo`}
                    label={`${T.templateTitle} (≤ ${TITLE_MAX})`}
                    value={t.title}
                    onChange={(v) => setTemplate(i, { title: v })}
                  />
                  <TextInput
                    id={`${uid}-m${i}-texto`}
                    label={`${T.templateBody} (≤ ${BODY_MAX})`}
                    value={t.body}
                    onChange={(v) => setTemplate(i, { body: v })}
                  />
                </div>
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    icon="trash-2"
                    onClick={() => setTemplates((list) => list.filter((_, j) => j !== i))}
                  >
                    {T.removeTemplate(t.name)}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {errors.templates && (
            <p role="alert" className="flex items-start gap-1.5 type-meta text-danger">
              <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
              {errors.templates}
            </p>
          )}
          {templates.length < 20 && (
            <div>
              <Button
                size="sm"
                variant="outline"
                icon="plus"
                onClick={() =>
                  setTemplates((list) => [
                    ...list,
                    { name: "", title: "{titulo}", body: "{linha_fina}" },
                  ])
                }
              >
                {T.addTemplate}
              </Button>
            </div>
          )}
        </section>

        <FieldShell id={`${uid}-motivo`} label={T.reason}>
          <input
            id={`${uid}-motivo`}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={CONTROL_CLASS}
          />
        </FieldShell>
        <div className="flex flex-col gap-3">
          <div>
            <Button type="submit" size="md" icon="check" disabled={saving}>
              {saving ? T.saving : T.save}
            </Button>
          </div>
          <ActionMessage result={result} />
        </div>
      </form>

      <section aria-labelledby={`${uid}-contingencia`} className="flex flex-col gap-4">
        <h2 id={`${uid}-contingencia`} className="type-section text-strong">
          {T.pause.section}
        </h2>
        {paused.on ? (
          <InlineAlert tone="warn" role="none">
            {paused.by && paused.at
              ? PUSH_ADMIN_TEXT.banners.paused(
                  paused.by.name,
                  clockTime(paused.at),
                  paused.reason ?? "",
                )
              : PUSH_ADMIN_TEXT.banners.pausedShort}
          </InlineAlert>
        ) : (
          <p className="type-body text-meta">{T.pause.body}</p>
        )}
        {paused.on && pendingResume && (
          <InlineAlert
            tone="info"
            role="none"
            action={
              canApprove ? (
                <Button size="sm" variant="outline-strong" onClick={approveResume} disabled={busy}>
                  {T.resume.approve}
                </Button>
              ) : undefined
            }
          >
            {pendingResume.requestedBy?.id === currentUserId
              ? T.resume.pendingOwn
              : T.resume.pending(pendingResume.requestedBy?.name ?? "alguém")}
          </InlineAlert>
        )}
        <div className="flex flex-wrap gap-3">
          {!paused.on && (
            <Button
              size="md"
              variant="danger"
              icon="circle-pause"
              onClick={(e) => {
                setTrigger(e.currentTarget);
                setDialogError(null);
                setPauseOpen(true);
              }}
            >
              {T.pause.trigger}
            </Button>
          )}
          {paused.on && !pendingResume && (
            <Button
              size="md"
              variant="outline-strong"
              icon="play"
              onClick={(e) => {
                setTrigger(e.currentTarget);
                setDialogError(null);
                setResumeOpen(true);
              }}
            >
              {T.resume.trigger}
            </Button>
          )}
        </div>
        <ActionMessage result={contingency} />
      </section>

      <section aria-labelledby={`${uid}-tecnica`} className="flex flex-col gap-2">
        <h2 id={`${uid}-tecnica`} className="type-section text-strong">
          {T.vapid.section}
        </h2>
        <p className="flex items-start gap-2 type-body text-strong">
          <Icon
            name={settings.vapid.ok ? "check" : "circle-alert"}
            size={20}
            className={cx("mt-0.5 shrink-0", settings.vapid.ok ? "text-service" : "text-danger")}
          />
          {settings.vapid.ok ? T.vapid.ok : T.vapid.missing(settings.vapid.missing)}
        </p>
      </section>

      <PauseDialog
        open={pauseOpen}
        busy={busy}
        error={dialogError}
        onCancel={closeDialogs}
        onConfirm={pause}
      />
      <Dialog open={resumeOpen} title={T.resume.title} onClose={closeDialogs}>
        <div className="flex flex-col gap-4 text-left">
          <p className="type-body text-strong">{T.resume.body}</p>
          <TextInput
            id={`${uid}-retomar-motivo`}
            label={T.resume.reason}
            value={resumeReason}
            onChange={setResumeReason}
          />
          {dialogError && (
            <p role="alert" className="type-body text-danger">
              {dialogError}
            </p>
          )}
          <div className="mt-2 flex flex-wrap justify-end gap-2.5">
            <Button size="md" variant="outline" onClick={closeDialogs} disabled={busy}>
              {T.pause.cancel}
            </Button>
            <Button size="md" disabled={!resumeReason.trim() || busy} onClick={requestResume}>
              {T.resume.confirm}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
