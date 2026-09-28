"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { REVIEW_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import type { ActionReply } from "./QueueTable";

export interface DecisionPanelProps {
  articleId: string;
  recommended: { label: string; rationale: string | null } | null;
  human: { label: string; by: string | null; at: string } | null;
  /** Motivo do checklist incompleto: Aprovar fica desabilitado com o texto visível. */
  blocker?: string;
  editHref: string;
  actions?: {
    approve?: (i: { id: string }) => Promise<ActionReply>;
    reject?: (i: { id: string; reason: string }) => Promise<ActionReply>;
    requestChanges?: (i: { id: string; reason: string }) => Promise<ActionReply>;
    reprocess?: (i: { id: string }) => Promise<ActionReply>;
  };
  className?: string;
}

type Asking = "reject" | "requestChanges" | null;

/**
 * Decisão recomendada × decisão humana (E03) e as ações Rejeitar, Pedir ajuste, Reprocessar e
 * Aprovar e publicar. Rejeitar e Pedir ajuste pedem motivo; Aprovar só com checklist completo.
 */
export function DecisionPanel({
  articleId,
  recommended,
  human,
  blocker,
  editHref,
  actions,
  className,
}: DecisionPanelProps) {
  const router = useRouter();
  const uid = useId();
  const [asking, setAsking] = useState<Asking>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionReply | null>(null);
  const [pending, start] = useTransition();

  const done = (r: ActionReply) => {
    setStatus(r);
    if (r.ok) router.refresh();
  };
  const close = () => {
    setAsking(null);
    setReason("");
    setError(null);
  };
  const confirm = () => {
    if (!reason.trim()) {
      setError(T.reasonRequired);
      return;
    }
    const fn = asking === "reject" ? actions?.reject : actions?.requestChanges;
    if (!fn) return;
    start(async () => {
      const r = await fn({ id: articleId, reason });
      close();
      done(r);
    });
  };

  return (
    <section
      aria-labelledby={`${uid}-titulo`}
      className={cx("rounded-lg border border-line-subtle bg-card-white p-4", className)}
    >
      <h2 id={`${uid}-titulo`} className="type-section text-strong">
        {T.recommendedVsHuman}
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-dashed border-ai bg-ia-soft p-3">
          <dt className="type-eyebrow text-ai">{T.recommended}</dt>
          <dd className="mt-1 type-body font-semibold text-strong">{recommended?.label ?? "—"}</dd>
          {recommended?.rationale && (
            <dd className="mt-1 type-meta text-meta">{recommended.rationale}</dd>
          )}
        </div>
        <div className="rounded-md border border-line-subtle p-3">
          <dt className="type-eyebrow text-meta">{T.human}</dt>
          <dd className="mt-1 type-body font-semibold text-strong">
            {human ? human.label : T.pendingHuman}
          </dd>
          {human?.by && (
            <dd className="mt-1 type-meta text-meta">
              {human.by} · {human.at}
            </dd>
          )}
        </div>
      </dl>

      <p role="status" aria-live="polite" className="mt-3 type-body">
        {status && (
          <span className={status.ok ? "text-service" : "text-danger"}>{status.message}</span>
        )}
      </p>

      {actions && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Button
              size="md"
              disabled={Boolean(blocker) || pending || !actions.approve}
              onClick={() =>
                actions.approve &&
                start(async () => done(await actions.approve!({ id: articleId })))
              }
              aria-describedby={blocker ? `${uid}-bloqueio` : undefined}
            >
              {T.approve}
            </Button>
            {blocker && (
              <p id={`${uid}-bloqueio`} className="flex items-start gap-1.5 type-meta text-warn">
                <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
                {T.approveDisabled(blocker)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.requestChanges && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setAsking("requestChanges")}
              >
                {T.requestChanges}
              </Button>
            )}
            {actions.reprocess && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => start(async () => done(await actions.reprocess!({ id: articleId })))}
              >
                {T.reprocess}
              </Button>
            )}
            {actions.reject && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setAsking("reject")}
              >
                {T.reject}
              </Button>
            )}
            <Button size="sm" variant="text" href={editHref}>
              {T.edit}
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={asking !== null}
        onClose={close}
        title={asking === "reject" ? T.reject : T.requestChanges}
        actions={
          <>
            <Button size="md" fullWidth disabled={pending} onClick={confirm}>
              {T.confirm}
            </Button>
            <Button size="md" variant="text" onClick={close}>
              {T.cancel}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2 text-left">
          <label htmlFor={`${uid}-motivo`} className="type-label text-16 text-strong">
            {asking === "reject" ? T.reasonLabel : T.noteLabel}
          </label>
          <textarea
            id={`${uid}-motivo`}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${uid}-erro` : undefined}
            className={cx(
              "border-control rounded-lg bg-input px-4 py-3 type-body text-strong",
              error && "field-error",
            )}
          />
          {error && (
            <p id={`${uid}-erro`} role="alert" className="type-meta text-danger">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </section>
  );
}
