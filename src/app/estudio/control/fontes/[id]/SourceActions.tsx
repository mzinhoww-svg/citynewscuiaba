"use client";

import { useState } from "react";
import {
  ActionMessage,
  BlockSourceDialog,
  Button,
  ConfirmByTypingDialog,
  useFormAction,
} from "@/components";
import type { FormAction } from "@/components";
import { ACTIONS, REMOVE_DIALOG } from "@/content/pt-BR/sources-admin-detail";
import type { SourceStatus, StatusReason } from "@/lib/sources/types";

export interface SourceActionsProps {
  id: string;
  version: number;
  name: string;
  status: SourceStatus;
  statusReason: StatusReason | null;
  archived: boolean;
  /** `sourceStatusAction`. */
  statusAction: FormAction;
  /** `collectNowAction`. */
  collectAction: FormAction;
}

/**
 * Ações principais do cabeçalho da fonte: Coletar agora, Pausar/Retomar/Ativar, Bloquear (ou pedir
 * desbloqueio), Excluir fonte (confirmação digitada) e Restaurar. Cada resultado aparece numa região
 * `status` logo abaixo; conflito de versão oferece "Recarregar".
 */
export function SourceActions({
  id,
  version,
  name,
  status,
  statusReason,
  archived,
  statusAction,
  collectAction,
}: SourceActionsProps) {
  const [blockOpen, setBlockOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const change = useFormAction(statusAction);
  const collect = useFormAction(collectAction);
  const running = status === "active" || status === "degraded";

  const send = (action: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("version", String(version));
    fd.set("action", action);
    change.submit(fd);
  };
  const collectNow = () => {
    const fd = new FormData();
    fd.set("id", id);
    collect.submit(fd);
  };
  const busy = change.pending || collect.pending;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {archived ? (
          <Button size="md" icon="refresh-cw" disabled={busy} onClick={() => send("restore")}>
            {ACTIONS.restore}
          </Button>
        ) : (
          <>
            {running && (
              <Button size="md" icon="refresh-cw" disabled={busy} onClick={collectNow}>
                {collect.pending ? ACTIONS.collecting : ACTIONS.collectNow}
              </Button>
            )}
            {running && (
              <Button size="md" variant="outline" disabled={busy} onClick={() => send("pause")}>
                {ACTIONS.pause}
              </Button>
            )}
            {status === "paused" && (
              <Button size="md" disabled={busy} onClick={() => send("activate")}>
                {statusReason === "pending_activation" ? ACTIONS.activate : ACTIONS.resume}
              </Button>
            )}
            {status !== "blocked" ? (
              <Button
                size="md"
                variant="outline"
                disabled={busy}
                onClick={() => setBlockOpen(true)}
              >
                {ACTIONS.block}
              </Button>
            ) : (
              <Button
                size="md"
                variant="outline"
                disabled={busy}
                onClick={() => setBlockOpen(true)}
              >
                {ACTIONS.unblock}
              </Button>
            )}
            <Button
              size="md"
              variant="danger"
              disabled={busy || running}
              onClick={() => setRemoveOpen(true)}
            >
              {ACTIONS.remove}
            </Button>
          </>
        )}
      </div>
      {!archived && running && <p className="type-meta text-meta">{ACTIONS.removeNeedsPause}</p>}
      <ActionMessage state={collect.state} />
      <ActionMessage state={change.state} />
      {!archived && (
        <>
          <BlockSourceDialog
            open={blockOpen}
            onClose={() => setBlockOpen(false)}
            mode={status === "blocked" ? "unblock" : "block"}
            sourceId={id}
            version={version}
            sourceName={name}
            action={statusAction}
          />
          <ConfirmByTypingDialog
            open={removeOpen}
            onClose={() => setRemoveOpen(false)}
            title={REMOVE_DIALOG.title}
            intro={REMOVE_DIALOG.intro(name)}
            confirmText={name}
            confirmLabel={REMOVE_DIALOG.confirmLabel(name)}
            confirmHint={REMOVE_DIALOG.confirmHint}
            reasonLabel={REMOVE_DIALOG.reasonLabel}
            reasonHint={REMOVE_DIALOG.reasonHint}
            submitLabel={REMOVE_DIALOG.submit}
            action={statusAction}
            hidden={{ id, version: String(version), action: "archive" }}
          />
        </>
      )}
    </div>
  );
}
