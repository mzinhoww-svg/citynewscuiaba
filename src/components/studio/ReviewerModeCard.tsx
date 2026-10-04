"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { REVIEWER_TEXT as R, SWITCH_TEXT as T } from "@/content/pt-BR/switches";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/TextField";
import type { SwitchReply } from "./SwitchBoard";

export type ReviewerModeValue = "off" | "night" | "always";
const MODES: readonly ReviewerModeValue[] = ["off", "night", "always"];

export interface ReviewerModeCardProps {
  mode: ReviewerModeValue;
  since?: string;
  run: (i: { mode: ReviewerModeValue; reason: string }) => Promise<SwitchReply>;
  className?: string;
}

/**
 * Modo do revisor automático nos Interruptores: Desligado, À noite (20h às 6h em Cuiabá, padrão)
 * ou Sempre. Cada mudança pede motivo e fica na auditoria.
 *
 * ```tsx
 * <ReviewerModeCard mode="night" run={reviewerModeAction} />
 * ```
 */
export function ReviewerModeCard({ mode, since, run, className }: ReviewerModeCardProps) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState<ReviewerModeValue | null>(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<SwitchReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  const close = () => {
    setOpen(null);
    setReason("");
    setError(null);
    if (trigger) setTimeout(() => trigger.focus(), 0);
  };

  return (
    <section
      aria-labelledby={`${uid}-titulo`}
      className={cx(
        "flex flex-col gap-3 rounded-lg border border-line-subtle bg-card-white p-4",
        className,
      )}
    >
      <h2 id={`${uid}-titulo`} className="type-section text-strong">
        {R.title}
      </h2>
      <p className="type-body text-body">{R.about}</p>
      <p className="flex items-start gap-2 type-body text-strong">
        <Icon
          name={mode === "off" ? "triangle-alert" : "check"}
          size={18}
          className={mode === "off" ? "mt-0.5 shrink-0 text-warn" : "mt-0.5 shrink-0 text-service"}
        />
        <span>
          <span className="sr-only">{T.stateLabel}: </span>
          <strong>{R.modes[mode].label}</strong> · {R.modes[mode].about}
          {since && <span className="block type-meta text-meta">{since}</span>}
        </span>
      </p>
      <p
        role={status && !status.ok ? "alert" : "status"}
        aria-live="polite"
        className="min-h-6 type-body empty:hidden"
      >
        {status && (
          <span className={status.ok ? "text-service" : "text-danger"}>{status.message}</span>
        )}
      </p>
      <ul className="flex flex-wrap gap-2.5">
        {MODES.filter((m) => m !== mode).map((m) => (
          <li key={m}>
            <Button
              size="md"
              variant="outline"
              aria-label={R.choose(R.modes[m].label)}
              onClick={(e) => {
                setTrigger(e.currentTarget);
                setError(null);
                setOpen(m);
              }}
            >
              {R.modes[m].label}
            </Button>
          </li>
        ))}
      </ul>
      {open && (
        <Dialog open title={R.dialogTitle(R.modes[open].label)} onClose={close}>
          <div className="flex flex-col gap-4 text-left">
            <p className="type-body text-body">{R.modes[open].about}</p>
            <TextField
              id={`${uid}-motivo`}
              label={T.dialog.reason}
              hint={T.dialog.reasonHint}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            {error && (
              <p role="alert" className="type-body text-danger">
                {error}
              </p>
            )}
            <div className="mt-2 flex flex-wrap justify-end gap-2.5">
              <Button size="md" variant="outline" onClick={close} disabled={busy}>
                {T.dialog.cancel}
              </Button>
              <Button
                size="md"
                disabled={reason.trim().length === 0 || busy}
                onClick={() =>
                  start(async () => {
                    const r = await run({ mode: open, reason: reason.trim() });
                    if (!r.ok) {
                      setError(r.message);
                      return;
                    }
                    close();
                    setStatus(r);
                    router.refresh();
                  })
                }
              >
                {T.dialog.confirm}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
