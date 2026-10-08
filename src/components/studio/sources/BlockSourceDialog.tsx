"use client";

import { useId, useState } from "react";
import { DIALOG_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { TextInput } from "./fields";

export type BlockReason = "opt_out" | "legal" | "quality" | "other";

export interface BlockSourceDialogProps {
  open: boolean;
  name: string;
  /**
   * A fonte já está bloqueada: só "Pedido do veículo" é oferecido, para repetir a remoção das
   * reproduções quando a primeira falhou (FS-T6 relata a falha com `ok:false`).
   */
  alreadyBlocked?: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (v: { reason: BlockReason; details: string }) => void;
}

const REASONS: BlockReason[] = ["opt_out", "legal", "quality", "other"];

/**
 * Bloquear fonte (spec §7.3, §8): motivo (Pedido do veículo, Jurídico, Qualidade, Outro) e texto.
 * "Pedido do veículo" explica que a política de imagem vira nenhuma e as reproduções saem (D-F20).
 */
export function BlockSourceDialog({
  open,
  name,
  alreadyBlocked = false,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: BlockSourceDialogProps) {
  const T = DIALOG_TEXT.block;
  const uid = useId().replace(/:/g, "");
  const [reason, setReason] = useState<BlockReason | null>(alreadyBlocked ? "opt_out" : null);
  const [details, setDetails] = useState("");
  const [missing, setMissing] = useState(false);
  const options = alreadyBlocked ? (["opt_out"] as BlockReason[]) : REASONS;

  return (
    <Dialog open={open} title={T.title(name)} onClose={onCancel}>
      <div className="flex flex-col gap-4 text-left">
        <p className="type-body text-strong">{alreadyBlocked ? T.retryNote : T.body}</p>
        <fieldset
          className="flex flex-col gap-1 border-0 p-0"
          aria-describedby={missing ? `${uid}-erro` : undefined}
        >
          <legend className="mb-1 type-label text-strong">{T.reasonLegend}</legend>
          {options.map((r) => (
            <label key={r} className="flex min-h-tap items-center gap-2.5 type-body text-strong">
              <input
                type="radio"
                name={`${uid}-motivo`}
                value={r}
                checked={reason === r}
                onChange={() => {
                  setReason(r);
                  setMissing(false);
                }}
                className="size-5 accent-(--action-primary)"
              />
              {T.reasons[r]}
            </label>
          ))}
        </fieldset>
        {missing && (
          <p id={`${uid}-erro`} role="alert" className="type-meta text-danger">
            {T.reasonRequired}
          </p>
        )}
        {reason === "opt_out" && (
          <p className="rounded-md bg-atencao-soft px-3 py-2 type-meta text-strong">
            {T.optOutNote}
          </p>
        )}
        <TextInput id={`${uid}-detalhes`} label={T.details} value={details} onChange={setDetails} />
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
            disabled={busy}
            onClick={() => {
              if (!reason) return setMissing(true);
              onConfirm({ reason, details: details.trim() });
            }}
          >
            {T.confirm}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
