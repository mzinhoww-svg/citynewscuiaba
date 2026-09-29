"use client";

import { useId, useState } from "react";
import { DIALOG_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { TextInput } from "./fields";

export interface ConfirmByTypingDialogProps {
  open: boolean;
  /** Nome da fonte, exatamente como a pessoa precisa digitar. */
  name: string;
  /** Quando a ação não é possível agora (ex.: fonte ativa): explica e mantém o botão desabilitado. */
  blockedReason?: string | null;
  busy?: boolean;
  /** Erro devolvido pelo servidor. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: (v: { reason: string; typed: string }) => void;
}

/**
 * "Excluir fonte" (spec §8, Diálogos): explica o que acontece (arquivamento, itens e matérias
 * íntegros), pede o motivo e a digitação do nome da fonte — padrão das ações de contingência do P5.
 * `<dialog>` nativo: foco preso e Esc fecha; quem abre devolve o foco ao gatilho.
 */
export function ConfirmByTypingDialog({
  open,
  name,
  blockedReason,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: ConfirmByTypingDialogProps) {
  const T = DIALOG_TEXT.archive;
  const uid = useId().replace(/:/g, "");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const mismatch = typed.trim() !== "" && typed.trim() !== name;
  const ready = !blockedReason && reason.trim() !== "" && typed.trim() === name;

  return (
    <Dialog open={open} title={T.title(name)} onClose={onCancel}>
      <div className="flex flex-col gap-4 text-left">
        <p className="type-body text-strong">{T.body}</p>
        {blockedReason ? (
          <p role="alert" className="type-body font-semibold text-danger">
            {blockedReason}
          </p>
        ) : (
          <>
            <TextInput id={`${uid}-motivo`} label={T.reason} value={reason} onChange={setReason} />
            <TextInput
              id={`${uid}-nome`}
              label={T.confirmLabel(name)}
              value={typed}
              onChange={setTyped}
              error={mismatch ? T.mismatch : null}
            />
          </>
        )}
        {error && (
          <p role="alert" className="type-body text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
            {DIALOG_TEXT.cancel}
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
