"use client";

import { useId, useState } from "react";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";

export interface FrequencyOption {
  value: string;
  label: string;
}

export interface BulkActionsBarProps {
  /** Fontes selecionadas na página atual. */
  count: number;
  busy?: boolean;
  onPause: () => void;
  onActivate: () => void;
  onApplyFrequency: (minutes: number | null) => void;
  onClear: () => void;
  frequencyOptions: readonly FrequencyOption[];
  className?: string;
}

/**
 * Barra de ações em lote (spec §8, O03): aparece com a seleção, anuncia a contagem
 * (`aria-live="polite"`) e confirma a pausa antes de aplicar (até 50 fontes, §7.6).
 *
 * ```tsx
 * <BulkActionsBar count={2} onPause={pause} onActivate={activate} onApplyFrequency={setFreq}
 *   onClear={clear} frequencyOptions={options} />
 * ```
 */
export function BulkActionsBar({
  count,
  busy = false,
  onPause,
  onActivate,
  onApplyFrequency,
  onClear,
  frequencyOptions,
  className,
}: BulkActionsBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [freq, setFreq] = useState("");
  const selectId = useId();

  if (count === 0) return null;

  return (
    <div
      className={cx(
        "sticky bottom-0 z-sticky flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-card-white p-4 shadow-dialog",
        className,
      )}
    >
      <p aria-live="polite" className="type-body font-semibold text-strong">
        {T.bulk.selected(count)}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmOpen(true)}>
          {T.bulk.pause}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onActivate}>
          {T.bulk.activate}
        </Button>
        <label htmlFor={selectId} className="sr-only">
          {T.bulk.frequencyLabel}
        </label>
        <select
          id={selectId}
          value={freq}
          onChange={(e) => setFreq(e.target.value)}
          className="border-control h-tap rounded-lg bg-input px-3 type-meta text-strong"
        >
          <option value="">{T.bulk.frequencyLabel}</option>
          {frequencyOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || freq === ""}
          onClick={() => onApplyFrequency(freq === "padrao" ? null : Number(freq))}
        >
          {T.bulk.apply}
        </Button>
        <Button size="sm" variant="text" disabled={busy} onClick={onClear}>
          {T.bulk.clear}
        </Button>
      </div>
      <Dialog
        open={confirmOpen}
        title={T.bulk.pauseDialogTitle(count)}
        onClose={() => setConfirmOpen(false)}
        actions={
          <>
            <Button size="md" variant="outline" onClick={() => setConfirmOpen(false)}>
              {T.bulk.cancel}
            </Button>
            <Button
              size="md"
              variant="danger"
              onClick={() => {
                setConfirmOpen(false);
                onPause();
              }}
            >
              {T.bulk.pauseDialogConfirm(count)}
            </Button>
          </>
        }
      >
        {T.bulk.pauseDialogBody}
      </Dialog>
    </div>
  );
}
