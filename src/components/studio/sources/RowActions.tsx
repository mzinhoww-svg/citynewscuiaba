"use client";

import { useTransition } from "react";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin-list";
import type { SourceListRow } from "@/lib/db/queries/sources-admin";
import { collectNowAction, sourceStatusAction } from "@/app/estudio/control/fontes/actions";
import { Button } from "../../ui/Button";

export interface RowReply {
  ok: boolean;
  message: string;
}

export interface RowActionsProps {
  row: Pick<SourceListRow, "id" | "name" | "status" | "statusReason" | "archived" | "version">;
  onResult: (reply: RowReply) => void;
}

/** Quais ações cabem no estado da fonte (a mesma regra vale no servidor e no banco). */
export function rowActionsFor(
  row: Pick<RowActionsProps["row"], "status" | "statusReason" | "archived">,
) {
  if (row.archived) return { collect: false, pause: false, resume: false, activate: false };
  const running = row.status === "active" || row.status === "degraded";
  const first = row.status === "paused" && row.statusReason === "pending_activation";
  return {
    collect: running,
    pause: running,
    resume: row.status === "paused" && !first,
    activate: first,
  };
}

/**
 * Ações de uma fonte na lista: coletar agora, pausar e reativar. A primeira ativação exige o teste
 * de conexão e a revisão dos termos, então leva à página da fonte.
 */
export function RowActions({ row, onResult }: RowActionsProps) {
  const [pending, start] = useTransition();
  const can = rowActionsFor(row);
  const t = T.rowActions;
  if (!can.collect && !can.pause && !can.resume && !can.activate) return null;

  const run = (kind: "collect" | "pause" | "resume") =>
    start(async () => {
      const fd = new FormData();
      fd.set("id", row.id);
      if (kind === "collect") {
        onResult(await collectNowAction(fd));
        return;
      }
      fd.set("version", String(row.version));
      fd.set("action", kind);
      onResult(await sourceStatusAction(fd));
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {can.collect && (
        <Button
          size="sm"
          variant="outline"
          icon="refresh-cw"
          disabled={pending}
          aria-label={t.collectFor(row.name)}
          onClick={() => run("collect")}
        >
          {pending ? t.running : t.collect}
        </Button>
      )}
      {can.pause && (
        <Button
          size="sm"
          variant="outline"
          icon="clock"
          disabled={pending}
          aria-label={t.pauseFor(row.name)}
          onClick={() => run("pause")}
        >
          {t.pause}
        </Button>
      )}
      {can.resume && (
        <Button
          size="sm"
          variant="outline"
          icon="check"
          disabled={pending}
          aria-label={t.resumeFor(row.name)}
          onClick={() => run("resume")}
        >
          {t.resume}
        </Button>
      )}
      {can.activate && (
        <Button
          size="sm"
          variant="outline"
          icon="check"
          href={`/estudio/control/fontes/${row.id}`}
          aria-label={t.activateFor(row.name)}
        >
          {t.activate}
        </Button>
      )}
    </div>
  );
}
