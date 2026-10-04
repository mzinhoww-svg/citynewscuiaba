"use client";

import { useId, useState } from "react";
import {
  fastFrequencyOptions,
  formatMinutes,
  normalFrequencyOptions,
  SOURCES_LIST_TEXT as T,
} from "@/content/pt-BR/sources-admin";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";

export interface BulkFrequencyDialogProps {
  open: boolean;
  /** Fontes selecionadas (para o título e a contagem prevista). */
  count: number;
  defaultFrequencyMinutes: number;
  fastLane: { max: number; used: number };
  busy?: boolean;
  onCancel: () => void;
  onApply: (frequencyMinutes: number | null, reason: string) => void;
}

type Mode = "padrao" | "rapida" | "normal";

const FAST_OPTIONS = fastFrequencyOptions();
const NORMAL_OPTIONS = normalFrequencyOptions();

/**
 * Mudar frequência em lote (wireframe `Lote.dc.html`, spec §7.6): rádios por via (padrão global,
 * via rápida, ciclo normal), resultado previsto e um motivo obrigatório que vai para a auditoria.
 *
 * ```tsx
 * <BulkFrequencyDialog open count={3} defaultFrequencyMinutes={30} fastLane={{ max: 10, used: 0 }}
 *   onCancel={close} onApply={(minutes, reason) => runBulk("frequency", minutes, reason)} />
 * ```
 */
export function BulkFrequencyDialog({
  open,
  count,
  defaultFrequencyMinutes,
  fastLane,
  busy = false,
  onCancel,
  onApply,
}: BulkFrequencyDialogProps) {
  const [mode, setMode] = useState<Mode>("padrao");
  const [fastValue, setFastValue] = useState(String(FAST_OPTIONS[0]?.value ?? "10"));
  const [normalValue, setNormalValue] = useState(String(defaultFrequencyMinutes));
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const name = useId();

  const minutes =
    mode === "padrao" ? null : mode === "rapida" ? Number(fastValue) : Number(normalValue);
  const resultLabel =
    mode === "padrao"
      ? `${formatMinutes(defaultFrequencyMinutes)} · padrão`
      : formatMinutes(minutes!);
  const free = Math.max(0, fastLane.max - fastLane.used);
  const ignored = mode === "rapida" ? Math.max(0, count - free) : 0;
  const applied = count - ignored;

  const submit = () => {
    if (!reason.trim()) {
      setReasonError(T.bulkFrequency.reasonRequired);
      return;
    }
    onApply(minutes, reason.trim());
  };

  return (
    <Dialog open={open} title={T.bulkFrequency.title(count)} onClose={onCancel}>
      <fieldset className="flex flex-col gap-3 border-0 p-0 text-left">
        <legend className="type-label mb-1 font-semibold text-strong">
          {T.bulkFrequency.legend}
        </legend>
        <label className="flex items-center gap-2.5 type-body text-strong">
          <input
            type="radio"
            name={name}
            checked={mode === "padrao"}
            onChange={() => setMode("padrao")}
            className="size-5 accent-(--action-primary)"
          />
          {T.bulkFrequency.followDefault(formatMinutes(defaultFrequencyMinutes))}
        </label>
        <label className="flex flex-wrap items-center gap-2.5 type-body text-strong">
          <input
            type="radio"
            name={name}
            checked={mode === "rapida"}
            onChange={() => setMode("rapida")}
            className="size-5 accent-(--action-primary)"
          />
          {T.bulkFrequency.fastLane}
          <select
            aria-label={T.bulkFrequency.fastLaneSelectLabel}
            value={fastValue}
            onChange={(e) => {
              setFastValue(e.target.value);
              setMode("rapida");
            }}
            className="border-control h-tap rounded-lg bg-input px-3 type-body text-strong"
          >
            {FAST_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-wrap items-center gap-2.5 type-body text-strong">
          <input
            type="radio"
            name={name}
            checked={mode === "normal"}
            onChange={() => setMode("normal")}
            className="size-5 accent-(--action-primary)"
          />
          {T.bulkFrequency.normalCycle}
          <select
            aria-label={T.bulkFrequency.normalSelectLabel}
            value={normalValue}
            onChange={(e) => {
              setNormalValue(e.target.value);
              setMode("normal");
            }}
            className="border-control h-tap rounded-lg bg-input px-3 type-body text-strong"
          >
            {NORMAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <p className="rounded-md bg-section p-3 text-left type-meta text-strong">
        {T.bulkFrequency.predicted(applied, resultLabel)}
        {ignored > 0 ? T.bulkFrequency.predictedIgnored(ignored) : null}
      </p>

      <label className="flex flex-col gap-1.5 text-left type-body text-strong">
        <span className="font-semibold">{T.bulkFrequency.reasonLabel}</span>
        <input
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            if (reasonError) setReasonError(null);
          }}
          aria-invalid={reasonError ? true : undefined}
          className="border-control h-tap rounded-lg bg-input px-3 type-body text-strong"
        />
        {reasonError && (
          <span role="alert" className="type-meta text-danger">
            {reasonError}
          </span>
        )}
      </label>

      <div className="mt-2 flex justify-end gap-2.5">
        <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
          {T.bulkFrequency.cancel}
        </Button>
        <Button size="md" onClick={submit} disabled={busy}>
          {T.bulkFrequency.confirm(count)}
        </Button>
      </div>
    </Dialog>
  );
}
