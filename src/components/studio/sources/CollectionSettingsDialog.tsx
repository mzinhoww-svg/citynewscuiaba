"use client";

import { useActionState, useState } from "react";
import {
  setDefaultFrequencyAction,
  setFastLaneMaxAction,
} from "@/app/estudio/control/fontes/actions";
import {
  DEFAULT_FREQUENCY_OPTIONS,
  SOURCES_LIST_TEXT as T,
} from "@/content/pt-BR/sources-admin-list";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { InlineAlert } from "../../ui/InlineAlert";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";

export interface CollectionSettingsDialogProps {
  /** Frequência padrão atual, em minutos (30 a 1440). */
  defaultMinutes: number;
  fastLane: { max: number; used: number; paused: number };
}

type Reply = { ok: boolean; message: string } | null;

/**
 * Configurações da coleta: frequência padrão (só o ciclo normal, sem 10, 15 e 20) e vagas da via
 * rápida, com o uso atual. Cada campo salva por conta própria e a mudança é auditada no banco.
 */
export function CollectionSettingsDialog({
  defaultMinutes,
  fastLane,
}: CollectionSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [freq, freqAction, freqPending] = useActionState<Reply, FormData>(
    (_p, fd) => setDefaultFrequencyAction(fd),
    null,
  );
  const [lane, laneAction, lanePending] = useActionState<Reply, FormData>(
    (_p, fd) => setFastLaneMaxAction(fd),
    null,
  );
  const t = T.settings;
  const reply = (r: Reply) =>
    r && (
      <InlineAlert tone={r.ok ? "success" : "error"} role="status" className="text-left">
        {r.message}
      </InlineAlert>
    );
  return (
    <>
      <Button variant="outline" size="md" icon="settings" onClick={() => setOpen(true)}>
        {t.open}
      </Button>
      <Dialog
        open={open}
        title={t.title}
        onClose={() => setOpen(false)}
        className="max-w-lg"
        actions={
          <div className="flex w-full flex-col gap-6 text-left">
            <form action={freqAction} className="flex flex-col gap-3">
              <Select
                id="config-frequencia-padrao"
                name="minutes"
                label={t.defaultLabel}
                hint={t.defaultHint}
                options={DEFAULT_FREQUENCY_OPTIONS}
                defaultValue={String(defaultMinutes)}
              />
              <Button type="submit" size="md" variant="outline" disabled={freqPending}>
                {t.save}
              </Button>
              {reply(freq)}
            </form>
            <form action={laneAction} className="flex flex-col gap-3">
              <p className="type-label text-strong">{t.lane(fastLane.used, fastLane.max)}</p>
              {fastLane.paused > 0 && (
                <p className="type-meta text-meta">{t.laneIdle(fastLane.paused)}</p>
              )}
              <TextField
                id="config-vagas-via-rapida"
                name="max"
                label={t.fastMaxLabel}
                hint={t.fastMaxHint}
                inputMode="numeric"
                maxLength={2}
                defaultValue={String(fastLane.max)}
              />
              <Button type="submit" size="md" variant="outline" disabled={lanePending}>
                {t.saveFast}
              </Button>
              {reply(lane)}
            </form>
            <Button variant="text" size="md" className="self-center" onClick={() => setOpen(false)}>
              {t.close}
            </Button>
          </div>
        }
      >
        {t.intro}
      </Dialog>
    </>
  );
}
