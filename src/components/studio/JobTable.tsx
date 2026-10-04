"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CONTROL_TEXT, stepLabel } from "@/content/pt-BR/control";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";

const T = CONTROL_TEXT.failures;

export interface JobRow {
  kind: "quarantine" | "retrying";
  id: number;
  step: string;
  itemRef: string;
  runRef: string | null;
  attempts: number;
  error: string;
  at: string;
}

export interface ActionReply {
  ok: boolean;
  message: string;
}

export interface JobTableProps {
  rows: JobRow[];
  /** Ações de operação; ausente = só leitura (papel sem `source.manage`). */
  actions?: {
    retry: (i: { ids: number[]; keepHumanDecisions: boolean }) => Promise<ActionReply>;
    discard: (i: { ids: number[]; reason: string }) => Promise<ActionReply>;
  };
  className?: string;
}

/**
 * Falhas do pipeline (O06): quarentena e mensagens aguardando nova tentativa. Quem opera
 * seleciona mensagens em quarentena e reprocessa a partir da etapa que falhou (mantendo
 * decisões humanas por padrão) ou descarta com motivo. Resultado em `role="status"`.
 */
export function JobTable({ rows, actions, className }: JobTableProps) {
  const router = useRouter();
  const uid = useId();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [keepHuman, setKeepHuman] = useState(true);
  const [status, setStatus] = useState<ActionReply | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = [...selected];

  const finish = (r: ActionReply) => {
    setStatus(r);
    if (r.ok) setSelected(new Set());
    router.refresh();
  };
  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const closeDiscard = () => {
    setDiscardOpen(false);
    setReason("");
    setReasonError(null);
  };

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <p role="status" aria-live="polite" className="min-h-6 type-body">
        {status && (
          <span
            className={cx(
              "inline-flex items-start gap-2",
              status.ok ? "text-service" : "text-danger",
            )}
          >
            <Icon name={status.ok ? "check" : "circle-alert"} size={20} className="mt-0.5" />
            {status.message}
          </span>
        )}
      </p>

      {actions ? (
        <fieldset className="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-card-white p-4">
          <legend className="sr-only">{T.reprocess}</legend>
          <p className="w-full type-meta text-meta" aria-live="polite">
            {T.selected(ids.length)}
          </p>
          <label className="inline-flex min-h-tap items-center gap-2 type-body text-strong">
            <input
              type="checkbox"
              checked={keepHuman}
              onChange={(e) => setKeepHuman(e.target.checked)}
              aria-describedby={`${uid}-keep`}
              className="size-5 accent-(--action-primary)"
            />
            {T.keepHuman}
          </label>
          <p id={`${uid}-keep`} className="w-full type-meta text-meta">
            {T.keepHumanHint}
          </p>
          <Button
            size="md"
            icon="refresh-cw"
            disabled={ids.length === 0 || pending}
            onClick={() =>
              start(async () => finish(await actions.retry({ ids, keepHumanDecisions: keepHuman })))
            }
          >
            {T.reprocess}
          </Button>
          <Button
            size="md"
            variant="outline"
            icon="trash-2"
            disabled={ids.length === 0 || pending}
            onClick={() => setDiscardOpen(true)}
          >
            {T.discard}
          </Button>
        </fieldset>
      ) : (
        <p className="type-meta text-meta">{T.readOnly}</p>
      )}
      <p className="type-meta text-meta">{T.retryingNote}</p>

      <div
        role="region"
        aria-label={T.caption}
        tabIndex={0}
        className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
      >
        <table className="w-full min-w-[56rem] border-collapse text-left">
          <caption className="sr-only">{T.caption}</caption>
          <thead className="border-b border-line-subtle bg-section type-meta text-meta">
            <tr>
              {actions && (
                <th scope="col" className="w-12 px-3 py-3">
                  <span className="sr-only">{T.col.select}</span>
                </th>
              )}
              <th scope="col" className="px-3 py-3">
                {T.col.kind}
              </th>
              <th scope="col" className="px-3 py-3">
                {T.col.step}
              </th>
              <th scope="col" className="px-3 py-3">
                {T.col.item}
              </th>
              <th scope="col" className="px-3 py-3">
                {T.col.error}
              </th>
              <th scope="col" className="px-3 py-3 text-right">
                {T.col.attempts}
              </th>
              <th scope="col" className="px-3 py-3">
                {T.col.at}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.kind}:${r.id}`}
                className="border-b border-line-subtle align-top last:border-b-0"
              >
                {actions && (
                  <td className="px-3 py-3">
                    {r.kind === "quarantine" && (
                      <input
                        type="checkbox"
                        aria-label={T.selectRow(`${stepLabel(r.step)} ${r.itemRef}`)}
                        checked={selected.has(r.id)}
                        onChange={(e) => toggle(r.id, e.target.checked)}
                        className="size-5 accent-(--action-primary)"
                      />
                    )}
                  </td>
                )}
                <td className="px-3 py-3 type-body">
                  <span
                    className={cx(
                      "inline-flex items-center gap-1",
                      r.kind === "quarantine" ? "font-semibold text-danger" : "text-warn",
                    )}
                  >
                    <Icon
                      name={r.kind === "quarantine" ? "circle-alert" : "refresh-cw"}
                      size={16}
                    />
                    {T.kind[r.kind]}
                  </span>
                </td>
                <th scope="row" className="px-3 py-3 type-body font-normal text-strong">
                  {stepLabel(r.step)}
                </th>
                <td className="px-3 py-3 type-meta break-all text-body">{r.itemRef}</td>
                <td className="px-3 py-3 type-meta max-w-md text-body">{r.error}</td>
                <td className="px-3 py-3 text-right type-body tabular-nums">{r.attempts}</td>
                <td className="px-3 py-3 type-body tabular-nums">{formatDateTime(r.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {actions && (
        <Dialog
          open={discardOpen}
          onClose={closeDiscard}
          title={T.discardConfirm}
          className="text-left"
          actions={
            <>
              <Button
                size="md"
                fullWidth
                disabled={pending}
                onClick={() => {
                  if (!reason.trim()) {
                    setReasonError(T.reasonRequired);
                    return;
                  }
                  start(async () => {
                    const r = await actions.discard({ ids, reason });
                    closeDiscard();
                    finish(r);
                  });
                }}
              >
                {T.discard}
              </Button>
              <Button size="md" variant="text" onClick={closeDiscard}>
                {T.cancel}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-left">
            <p>{T.discardText}</p>
            <label htmlFor={`${uid}-reason`} className="type-label text-strong">
              {T.reason}
            </label>
            <textarea
              id={`${uid}-reason`}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError(null);
              }}
              rows={3}
              maxLength={500}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? `${uid}-reason-err` : undefined}
              className={cx(
                "border-control rounded-lg bg-input px-4 py-3 type-body text-strong",
                reasonError && "field-error",
              )}
            />
            {reasonError && (
              <p
                id={`${uid}-reason-err`}
                role="alert"
                className="flex gap-1.5 type-meta text-danger"
              >
                <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
                {reasonError}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
