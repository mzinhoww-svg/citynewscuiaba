"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SOURCE_ACTION_TEXT } from "@/content/pt-BR/sources-admin";
import { DETAIL_TEXT as T, DIALOG_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { isConflict, type ActionFn, type ActionState } from "@/lib/sources/action-state";
import type { SourceStatus, StatusReason } from "@/lib/sources/types";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { BlockSourceDialog } from "./BlockSourceDialog";
import { ConfirmByTypingDialog } from "./ConfirmByTypingDialog";
import { ActionMessage, JustificationField } from "./fields";

export interface SourceHeaderActionsProps {
  source: {
    id: string;
    version: number;
    name: string;
    status: SourceStatus;
    statusReason: StatusReason | null;
    archived: boolean;
  };
  /** `sourceStatusAction` (FS-T6). */
  statusAction: ActionFn;
  /** `collectNowAction` (FS-T6). */
  collectNowAction: ActionFn;
  className?: string;
}

type DialogKind = null | "block" | "archive" | "unblock";

/**
 * Ações principais do cabeçalho da fonte (spec §7.3, §7.4, §8): Coletar agora, Pausar/Retomar/
 * Ativar, Bloquear (também "Bloquear de novo (Pedido do veículo)" numa fonte já bloqueada, para
 * repetir a remoção das reproduções), Pedir desbloqueio (duas pessoas), Excluir fonte (digitar o
 * nome) e Restaurar. Diálogos nativos com foco preso; ao fechar, o foco volta ao gatilho.
 * Resultado em `role="status"`/`alert`; conflito de versão oferece "Recarregar".
 */
export function SourceHeaderActions({
  source,
  statusAction,
  collectNowAction,
  className,
}: SourceHeaderActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActionState | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  const [justificationError, setJustificationError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  const s = source.status;
  const active = !source.archived && (s === "active" || s === "degraded");
  const paused = !source.archived && s === "paused";
  const blocked = !source.archived && s === "blocked";

  const openDialog =
    (kind: Exclude<DialogKind, null>) => (e: { currentTarget: EventTarget | null }) => {
      setTrigger(e.currentTarget as HTMLElement | null);
      setDialogError(null);
      setDialog(kind);
    };
  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
    // O <dialog> some da árvore ao fechar: devolve o foco ao gatilho explicitamente.
    if (trigger) setTimeout(() => trigger.focus(), 0);
  };

  async function run(label: string, action: ActionFn, form: FormData, inDialog = false) {
    setBusy(label);
    if (!inDialog) setResult(null);
    let r: ActionState;
    try {
      r = await action(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    setBusy(null);
    if (inDialog && !r.ok) {
      setDialogError(r.message);
      return;
    }
    if (inDialog) closeDialog();
    setResult(r);
    if (r.ok) router.refresh();
  }

  const statusForm = (action: string, extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.set("id", source.id);
    form.set("version", String(source.version));
    form.set("action", action);
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    return form;
  };

  const conflict = isConflict(result);
  const btn = (
    label: string,
    onClick: (e: { currentTarget: EventTarget | null }) => void,
    extra: {
      variant?: "outline" | "danger" | "primary";
      icon?: "refresh-cw" | "circle-pause" | "play" | "ban" | "archive" | "shield";
    } = {},
  ): ReactNode => (
    <Button
      key={label}
      size="md"
      variant={extra.variant ?? "outline"}
      icon={extra.icon}
      disabled={busy !== null}
      onClick={onClick}
    >
      {busy === label ? T.actions.working : label}
    </Button>
  );

  return (
    <div className={className}>
      <div role="group" aria-label={T.actionsLabel} className="flex flex-wrap gap-2">
        {active &&
          btn(
            T.actions.collectNow,
            () => run(T.actions.collectNow, collectNowAction, statusForm("collect")),
            { icon: "refresh-cw", variant: "primary" },
          )}
        {active &&
          btn(T.actions.pause, () => run(T.actions.pause, statusAction, statusForm("pause")), {
            icon: "circle-pause",
          })}
        {paused &&
          btn(
            source.statusReason === "pending_activation" ? T.actions.activate : T.actions.resume,
            () =>
              run(
                T.actions.resume,
                statusAction,
                statusForm(source.statusReason === "pending_activation" ? "activate" : "resume"),
              ),
            { icon: "play", variant: "primary" },
          )}
        {!source.archived && !blocked && btn(T.actions.block, openDialog("block"), { icon: "ban" })}
        {blocked && btn(T.actions.blockAgain, openDialog("block"), { icon: "ban" })}
        {blocked && btn(T.actions.unblock, openDialog("unblock"), { icon: "shield" })}
        {!source.archived &&
          btn(T.actions.archive, openDialog("archive"), { icon: "archive", variant: "danger" })}
        {source.archived &&
          btn(
            T.actions.restore,
            () => run(T.actions.restore, statusAction, statusForm("restore")),
            { variant: "primary" },
          )}
      </div>
      <div className="mt-3 empty:hidden">
        <ActionMessage result={result}>
          {conflict && (
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              {T.actions.reload}
            </Button>
          )}
        </ActionMessage>
      </div>

      {dialog === "block" && (
        <BlockSourceDialog
          open
          name={source.name}
          alreadyBlocked={blocked}
          busy={busy !== null}
          error={dialogError}
          onCancel={closeDialog}
          onConfirm={({ reason, details }) =>
            run(T.actions.block, statusAction, statusForm("block", { reason, details }), true)
          }
        />
      )}
      {dialog === "archive" && (
        <ConfirmByTypingDialog
          open
          name={source.name}
          blockedReason={active ? DIALOG_TEXT.archive.needsPause : null}
          busy={busy !== null}
          error={dialogError}
          onCancel={closeDialog}
          onConfirm={({ reason, typed }) =>
            run(
              T.actions.archive,
              statusAction,
              statusForm("archive", { reason, confirmName: typed }),
              true,
            )
          }
        />
      )}
      {dialog === "unblock" && (
        <Dialog open title={T.unblock.title} onClose={closeDialog}>
          <div className="flex flex-col gap-4 text-left">
            <p className="type-body text-strong">{T.unblock.body}</p>
            <JustificationField
              id="desbloqueio-justificativa"
              value={justification}
              onChange={(v) => {
                setJustification(v);
                setJustificationError(null);
              }}
              error={justificationError}
            />
            {dialogError && (
              <p role="alert" className="type-body text-danger">
                {dialogError}
              </p>
            )}
            <div className="mt-2 flex flex-wrap justify-end gap-2.5">
              <Button size="md" variant="outline" onClick={closeDialog} disabled={busy !== null}>
                {T.unblock.cancel}
              </Button>
              <Button
                size="md"
                disabled={busy !== null}
                onClick={() => {
                  if (!justification.trim())
                    return setJustificationError(SOURCE_ACTION_TEXT.justificationRequired);
                  run(
                    T.actions.unblock,
                    statusAction,
                    statusForm("unblock", { justification: justification.trim() }),
                    true,
                  );
                }}
              >
                {T.unblock.confirm}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
