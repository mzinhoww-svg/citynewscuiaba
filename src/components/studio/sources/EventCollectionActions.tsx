"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SOURCE_ACTION_TEXT } from "@/content/pt-BR/sources-admin";
import { EVENT_TABS_TEXT as T } from "@/content/pt-BR/sources-admin-events";
import type { EventSourcePreviewData } from "@/lib/agenda/preview";
import type { ActionFn, ActionState } from "@/lib/sources/action-state";
import { Button } from "../../ui/Button";
import { EventSourcePreview } from "./EventSourcePreview";
import { ActionMessage } from "./fields";

export interface EventCollectionActionsProps {
  sourceId: string;
  canCollectNow: boolean;
  /** `testConnectionAction`: com fonte de eventos, devolve a prévia em `data`. */
  testAction: ActionFn;
  /** `collectNowAction`: com fonte de eventos, coleta real só desta fonte. */
  collectNowAction: ActionFn;
  className?: string;
}

const isPreview = (v: unknown): v is EventSourcePreviewData =>
  typeof v === "object" &&
  v !== null &&
  Array.isArray((v as { events?: unknown }).events) &&
  Array.isArray((v as { rejected?: unknown }).rejected);

/**
 * Botões da aba Coleta de uma fonte de eventos (AGM-T6): "Testar conexão" monta a prévia (até 5
 * eventos com os trechos de evidência e as recusas, nada gravado) e "Coletar agora" roda a coleta
 * real desta fonte e atualiza a tabela de execuções. Resultado em `status`/`alert`.
 */
export function EventCollectionActions({
  sourceId,
  canCollectNow,
  testAction,
  collectNowAction,
  className,
}: EventCollectionActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"test" | "collect" | null>(null);
  const [result, setResult] = useState<ActionState | null>(null);
  const [preview, setPreview] = useState<EventSourcePreviewData | null>(null);

  async function run(kind: "test" | "collect") {
    const form = new FormData();
    form.set("id", sourceId);
    setBusy(kind);
    setResult(null);
    if (kind === "test") setPreview(null);
    let r: ActionState;
    try {
      r = await (kind === "test" ? testAction : collectNowAction)(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
    }
    setBusy(null);
    setResult(r);
    if (kind === "test" && isPreview(r.data)) setPreview(r.data);
    if (r.ok || kind === "collect") router.refresh();
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button size="md" variant="outline" disabled={busy !== null} onClick={() => run("test")}>
          {busy === "test" ? T.testing : T.test}
        </Button>
        {canCollectNow && (
          <Button
            size="md"
            icon="refresh-cw"
            disabled={busy !== null}
            onClick={() => run("collect")}
          >
            {busy === "collect" ? T.collecting : T.collectNow}
          </Button>
        )}
      </div>
      <div className="mt-3 empty:hidden" aria-busy={busy !== null ? "true" : undefined}>
        <ActionMessage result={result} />
      </div>
      {preview && <EventSourcePreview preview={preview} headingLevel="h3" className="mt-4" />}
    </div>
  );
}
