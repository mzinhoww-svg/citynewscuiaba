"use client";

import { useState } from "react";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { BulkFrequencyDialog } from "./BulkFrequencyDialog";

export interface BulkActionsBarProps {
  /** Fontes selecionadas na página atual. */
  count: number;
  busy?: boolean;
  defaultFrequencyMinutes: number;
  fastLane: { max: number; used: number };
  onPause: () => void;
  onActivate: () => void;
  onApplyFrequency: (minutes: number | null, reason: string) => void;
  onClear: () => void;
  className?: string;
}

/**
 * Barra de ações em lote (spec §8, O03): aparece com a seleção, anuncia a contagem
 * (`aria-live="polite"`) e confirma a pausa antes de aplicar (até 50 fontes, §7.6). A mudança de
 * frequência abre `BulkFrequencyDialog` (wireframe `Lote.dc.html`), não um `<select>` solto
 * (achado da revisão FS-T7 fix round 1).
 *
 * ```tsx
 * <BulkActionsBar count={2} defaultFrequencyMinutes={30} fastLane={{ max: 10, used: 0 }}
 *   onPause={pause} onActivate={activate} onApplyFrequency={setFreq} onClear={clear} />
 * ```
 */
export function BulkActionsBar({
  count,
  busy = false,
  defaultFrequencyMinutes,
  fastLane,
  onPause,
  onActivate,
  onApplyFrequency,
  onClear,
  className,
}: BulkActionsBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [freqOpen, setFreqOpen] = useState(false);

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
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setFreqOpen(true)}>
          {T.bulk.frequencyButton}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmOpen(true)}>
          {T.bulk.pause}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={onActivate}>
          {T.bulk.activate}
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
      <BulkFrequencyDialog
        open={freqOpen}
        count={count}
        defaultFrequencyMinutes={defaultFrequencyMinutes}
        fastLane={fastLane}
        busy={busy}
        onCancel={() => setFreqOpen(false)}
        onApply={(minutes, reason) => {
          setFreqOpen(false);
          onApplyFrequency(minutes, reason);
        }}
      />
    </div>
  );
}
