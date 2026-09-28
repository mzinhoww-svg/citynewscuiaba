"use client";

import { useState, useTransition } from "react";
import { normalFrequencyOptions, SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin";
import {
  setDefaultFrequencyAction,
  setFastLaneMaxAction,
  type ActionState,
} from "@/app/estudio/control/fontes/actions";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";

export interface CollectionSettingsDialogProps {
  defaultFrequency: number;
  fastLane: { max: number; used: number; paused: number };
  className?: string;
}

const NORMAL_OPTIONS = normalFrequencyOptions();

/**
 * Configurações da coleta (spec §7.7, O03): padrão global de frequência (só a grade de 30 min a
 * 24 h — a via rápida nunca é padrão) e vagas da via rápida (0–20), com o uso atual.
 *
 * ```tsx
 * <CollectionSettingsDialog defaultFrequency={30} fastLane={{ max: 10, used: 0, paused: 0 }} />
 * ```
 */
export function CollectionSettingsDialog({
  defaultFrequency,
  fastLane,
  className,
}: CollectionSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [freqMsg, setFreqMsg] = useState<ActionState | null>(null);
  const [maxMsg, setMaxMsg] = useState<ActionState | null>(null);
  const [maxUsed, setMaxUsed] = useState(fastLane);
  const [freqPending, startFreq] = useTransition();
  const [maxPending, startMax] = useTransition();

  return (
    <div className={className}>
      <Button
        id="config-coleta-trigger"
        size="md"
        variant="outline"
        icon="sliders-horizontal"
        onClick={() => setOpen(true)}
      >
        {T.settings.trigger}
      </Button>
      <Dialog open={open} title={T.settings.title} onClose={() => setOpen(false)}>
        <form
          className="flex flex-col gap-3 text-left"
          action={(form: FormData) => {
            startFreq(async () => setFreqMsg(await setDefaultFrequencyAction(form)));
          }}
        >
          <Select
            id="fontes-config-frequencia"
            name="value"
            label={T.settings.defaultFrequencyLabel}
            defaultValue={String(defaultFrequency)}
            options={NORMAL_OPTIONS}
            error={freqMsg && !freqMsg.ok ? freqMsg.message : undefined}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={freqPending}>
            {T.settings.save}
          </Button>
          {freqMsg?.ok && (
            <p aria-live="polite" className="type-meta text-service">
              {freqMsg.message}
            </p>
          )}
        </form>

        <form
          className="mt-6 flex flex-col gap-3 text-left"
          action={(form: FormData) => {
            startMax(async () => {
              const r = await setFastLaneMaxAction(form);
              setMaxMsg(r);
              if (r.ok) {
                const value = Number(form.get("value"));
                if (Number.isInteger(value)) setMaxUsed((s) => ({ ...s, max: value }));
              }
            });
          }}
        >
          <TextField
            id="fontes-config-via-rapida"
            name="value"
            label={T.settings.fastLaneMaxLabel}
            inputMode="numeric"
            defaultValue={String(fastLane.max)}
            hint={T.settings.fastLaneMaxHint(maxUsed.used, maxUsed.max)}
            error={maxMsg && !maxMsg.ok ? maxMsg.message : undefined}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={maxPending}>
            {T.settings.save}
          </Button>
          {maxMsg?.ok && (
            <p aria-live="polite" className="type-meta text-service">
              {maxMsg.message}
            </p>
          )}
        </form>
      </Dialog>
    </div>
  );
}
