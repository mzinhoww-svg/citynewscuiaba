"use client";

import { useId, useState } from "react";
import { PUSH_ADMIN_TEXT, PUSH_SETTINGS_TEXT } from "@/content/pt-BR/notifications-admin";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { TextInput } from "../sources/fields";

export interface PauseDialogProps {
  open: boolean;
  busy?: boolean;
  /** Erro devolvido pelo servidor. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: (v: { reason: string; typed: string }) => void;
}

/**
 * "Pausar todos os envios" (spec §10.5): explica o efeito (vale na hora para tudo), pede o motivo
 * e a digitação de PAUSAR, padrão das ações de contingência do P5. `<dialog>` nativo: foco preso e
 * Esc fecha; quem abre devolve o foco ao gatilho.
 */
export function PauseDialog({ open, busy = false, error, onCancel, onConfirm }: PauseDialogProps) {
  const T = PUSH_SETTINGS_TEXT.pause;
  const uid = useId().replace(/:/g, "");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const word = PUSH_ADMIN_TEXT.pauseWord;
  const mismatch = typed.trim() !== "" && typed.trim() !== word;
  const ready = reason.trim() !== "" && typed.trim() === word;

  return (
    <Dialog open={open} title={T.title} onClose={onCancel}>
      <div className="flex flex-col gap-4 text-left">
        <p className="type-body text-strong">{T.body}</p>
        <TextInput id={`${uid}-motivo`} label={T.reason} value={reason} onChange={setReason} />
        <TextInput
          id={`${uid}-confirmar`}
          label={T.confirmLabel}
          value={typed}
          onChange={setTyped}
          error={mismatch ? T.mismatch : null}
        />
        {error && (
          <p role="alert" className="type-body text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
            {T.cancel}
          </Button>
          <Button
            size="md"
            variant="danger"
            disabled={!ready || busy}
            onClick={() => onConfirm({ reason: reason.trim(), typed: typed.trim() })}
          >
            {T.confirm}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
