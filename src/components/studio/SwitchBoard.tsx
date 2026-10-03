"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { SWITCH_TEXT as T } from "@/content/pt-BR/switches";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/TextField";

export interface SwitchCard {
  key: string;
  title: string;
  about: string;
  /** Efeito do estado atual, em texto. */
  effect: string;
  /** null = chave ausente no banco. */
  enabled: boolean | null;
  since?: string;
  note?: string;
}

export interface SwitchReply {
  ok: boolean;
  message: string;
}

export interface SwitchBoardProps {
  cards: SwitchCard[];
  run: (i: { key: never; value: boolean; reason: string }) => Promise<SwitchReply>;
  className?: string;
}

/** Cartões de interruptor: estado em texto + botão Ligar/Desligar com motivo obrigatório. */
export function SwitchBoard({ cards, run, className }: SwitchBoardProps) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState<SwitchCard | null>(null);
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
  const next = open ? !open.enabled : false;

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
          <li
            key={c.key}
            className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <h2 className="type-section text-strong">{c.title}</h2>
            <p className="type-body text-body">{c.about}</p>
            <p className="flex items-start gap-2 type-body text-strong">
              <Icon
                name={c.enabled ? "check" : "triangle-alert"}
                size={18}
                className={c.enabled ? "mt-0.5 shrink-0 text-service" : "mt-0.5 shrink-0 text-warn"}
              />
              <span>
                <span className="sr-only">{T.stateLabel}: </span>
                <strong>{c.enabled === null ? T.missing : c.enabled ? T.onWord : T.offWord}</strong>
                {c.enabled !== null && <> · {c.effect}</>}
                {c.since && <span className="block type-meta text-meta">{c.since}</span>}
              </span>
            </p>
            {c.note && <p className="type-meta font-medium text-strong">{c.note}</p>}
            {c.enabled !== null && (
              <div className="mt-auto">
                <Button
                  size="md"
                  variant={c.enabled ? "outline-strong" : "outline"}
                  aria-label={`${c.enabled ? T.turnOff : T.turnOn} ${c.title}`}
                  onClick={(e) => {
                    setTrigger(e.currentTarget);
                    setError(null);
                    setOpen(c);
                  }}
                >
                  {c.enabled ? T.turnOff : T.turnOn}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {open && (
        <Dialog open title={T.dialog.title(open.title, next)} onClose={close}>
          <div className="flex flex-col gap-4 text-left">
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
                variant="danger"
                disabled={reason.trim().length === 0 || busy}
                onClick={() =>
                  start(async () => {
                    const r = await run({
                      key: open.key as never,
                      value: next,
                      reason: reason.trim(),
                    });
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
    </div>
  );
}
