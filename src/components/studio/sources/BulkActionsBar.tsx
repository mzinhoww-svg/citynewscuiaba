"use client";

import { useActionState, useState } from "react";
import { bulkSourcesAction } from "@/app/estudio/control/fontes/actions";
import { BULK_FREQUENCY_OPTIONS, SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin-list";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { Select } from "../../ui/Select";

type BulkMode = "pause" | "activate" | "frequency";
type BulkReply = Awaited<ReturnType<typeof bulkSourcesAction>>;

export interface BulkActionsBarProps {
  /** Fontes selecionadas (o servidor aceita de 1 a 50). */
  ids: string[];
  onClear: () => void;
  /** Resultado do lote; quem chama mostra a mensagem e limpa a seleção. */
  onResult: (reply: BulkReply) => void;
}

export const BULK_MAX = 50;

/**
 * Barra de ações em lote: "N fontes selecionadas" (região `aria-live`), pausar, ativar e mudar a
 * frequência. Cada ação pede confirmação num diálogo com a contagem; o servidor devolve o
 * resultado por fonte e o motivo das ignoradas.
 */
export function BulkActionsBar({ ids, onClear, onResult }: BulkActionsBarProps) {
  const [mode, setMode] = useState<BulkMode | null>(null);
  const [, formAction, pending] = useActionState(async (_p: BulkReply | null, fd: FormData) => {
    const reply = await bulkSourcesAction(fd);
    onResult(reply);
    setMode(null);
    return reply;
  }, null);
  const n = ids.length;
  const tooMany = n > BULK_MAX;
  const t = T.bulk;
  const title = {
    pause: t.titlePause(n),
    activate: t.titleActivate(n),
    frequency: t.titleFrequency(n),
  };
  const confirm = {
    pause: t.confirmPause(n),
    activate: t.confirmActivate(n),
    frequency: t.confirmFrequency(n),
  };
  const body = { pause: t.bodyPause, activate: t.bodyActivate, frequency: t.bodyFrequency };

  return (
    <div
      role="group"
      aria-label={t.label}
      className="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-section px-4 py-3"
    >
      <p aria-live="polite" className="type-label text-strong">
        {n === 0 ? <span className="font-normal text-meta">{t.none}</span> : t.selected(n)}
        {tooMany && <span className="ml-2 font-normal text-danger">{t.limit}</span>}
      </p>
      {n > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon="clock"
            disabled={tooMany}
            onClick={() => setMode("pause")}
          >
            {t.pause}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon="check"
            disabled={tooMany}
            onClick={() => setMode("activate")}
          >
            {t.activate}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={tooMany}
            onClick={() => setMode("frequency")}
          >
            {t.frequency}
          </Button>
          <Button size="sm" variant="text" onClick={onClear}>
            {t.clear}
          </Button>
        </div>
      )}
      <Dialog
        open={mode !== null}
        title={mode ? title[mode] : undefined}
        onClose={() => (pending ? undefined : setMode(null))}
        actions={
          mode && (
            <form action={formAction} className="flex w-full flex-col gap-4 text-left">
              {ids.map((id) => (
                <input key={id} type="hidden" name="ids" value={id} />
              ))}
              <input type="hidden" name="action" value={mode} />
              {mode === "frequency" && (
                <Select
                  id="bulk-frequencia"
                  name="frequencyMinutes"
                  label={t.frequencyLabel}
                  options={BULK_FREQUENCY_OPTIONS}
                  defaultValue="default"
                />
              )}
              <Button type="submit" size="md" fullWidth disabled={pending || tooMany}>
                {confirm[mode]}
              </Button>
              <Button
                variant="text"
                size="md"
                disabled={pending}
                className="self-center"
                onClick={() => setMode(null)}
              >
                {t.cancel}
              </Button>
            </form>
          )
        }
      >
        {mode ? body[mode] : null}
      </Dialog>
    </div>
  );
}
