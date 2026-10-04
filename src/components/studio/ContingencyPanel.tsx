"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import {
  ACTION_LABEL,
  ACTION_NAME,
  CONTINGENCY_TEXT as T,
  type ContingencyAction,
} from "@/content/pt-BR/contingency";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Panel } from "../ui/Panel";
import { TextField } from "../ui/TextField";

export interface ContingencyReply {
  ok: boolean;
  message: string;
}

export interface ContingencyCard {
  id: string;
  title: string;
  /** Estado atual em texto (nunca só cor). */
  state: string;
  /** "desde …, por …" */
  since?: string;
  body: string;
  runbook: string;
  /** Ausente = sem botão (ex.: rollback sem versão anterior). */
  action?: ContingencyAction;
  /** Aviso extra (ex.: pedido de retomada já aberto). */
  note?: string;
  tone: "ok" | "warn";
}

export interface ContingencyPanelProps {
  cards: ContingencyCard[];
  run: (i: {
    action: ContingencyAction;
    typed: string;
    reason: string;
  }) => Promise<ContingencyReply>;
  className?: string;
}

/**
 * Botões de emergência (A15): um cartão por proteção com o estado atual, o runbook e a ação,
 * confirmada num diálogo que pede o motivo e a digitação do nome exato da ação.
 */
export function ContingencyPanel({ cards, run, className }: ContingencyPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState<ContingencyCard | null>(null);
  const [status, setStatus] = useState<ContingencyReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  const close = () => {
    setOpen(null);
    setError(null);
    if (trigger) setTimeout(() => trigger.focus(), 0);
  };

  return (
    <div className={cx("flex flex-col gap-6", className)}>
      <p
        role={status && !status.ok ? "alert" : "status"}
        aria-live="polite"
        className="min-h-6 type-body empty:hidden"
      >
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
      <ul className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <li key={c.id}>
            <Panel as="div" className="flex flex-col gap-3">
              <h2 className="type-section text-strong">{c.title}</h2>
              <p className="flex items-start gap-2 type-body text-strong">
                <Icon
                  name={c.tone === "ok" ? "check" : "triangle-alert"}
                  size={18}
                  className={
                    c.tone === "ok" ? "mt-0.5 shrink-0 text-service" : "mt-0.5 shrink-0 text-warn"
                  }
                />
                <span>
                  <span className="sr-only">{T.stateLabel}: </span>
                  {c.state}
                  {c.since && <span className="block type-meta text-meta">{c.since}</span>}
                </span>
              </p>
              <p className="type-body text-body">{c.body}</p>
              {c.note && <p className="type-meta font-medium text-strong">{c.note}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-3">
                {c.action && (
                  <Button
                    size="md"
                    variant={c.tone === "ok" ? "danger" : "outline-strong"}
                    onClick={(e) => {
                      setTrigger(e.currentTarget);
                      setError(null);
                      setOpen(c);
                    }}
                  >
                    {ACTION_LABEL[c.action]}
                  </Button>
                )}
                <a href={c.runbook} className="type-body font-medium text-link underline">
                  {T.runbook}
                </a>
              </div>
            </Panel>
          </li>
        ))}
      </ul>
      {open && open.action && (
        <ConfirmActionDialog
          action={open.action}
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={({ reason, typed }) => {
            const action = open.action!;
            start(async () => {
              const r = await run({ action, typed, reason });
              if (!r.ok) {
                setError(r.message);
                return;
              }
              close();
              setStatus(r);
              router.refresh();
            });
          }}
        />
      )}
    </div>
  );
}

function ConfirmActionDialog({
  action,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  action: ContingencyAction;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (v: { reason: string; typed: string }) => void;
}) {
  const D = T.dialog;
  const uid = useId().replace(/:/g, "");
  const name = ACTION_NAME[action];
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const mismatch = typed.trim() !== "" && typed.trim() !== name;
  const ready = reason.trim() !== "" && typed.trim() === name;
  return (
    <Dialog open title={D.title(ACTION_LABEL[action])} onClose={onCancel}>
      <div className="flex flex-col gap-4 text-left">
        <TextField
          id={`${uid}-motivo`}
          label={D.reason}
          hint={D.reasonHint}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <TextField
          id={`${uid}-nome`}
          label={D.typeLabel(name)}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          error={mismatch ? D.mismatch : undefined}
        />
        {error && (
          <p role="alert" className="type-body text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
            {D.cancel}
          </Button>
          <Button
            size="md"
            variant="danger"
            disabled={!ready || busy}
            onClick={() => onConfirm({ reason: reason.trim(), typed: typed.trim() })}
          >
            {D.confirm}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
