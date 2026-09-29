"use client";

import { useState } from "react";
import { MONITOR_TEXT as T } from "@/content/pt-BR/control-monitor";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

/**
 * "Executar agora": pede um ciclo manual (POST /api/control/run-now, com a sessão da pessoa).
 * O resultado aparece em linha, anunciado; não navega.
 */
export function RunNowButton({
  sourceId,
  label = T.runNow.button,
}: {
  sourceId?: string;
  label?: string;
}) {
  const [state, setState] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setState(null);
    try {
      const r = await fetch("/api/control/run-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sourceId ? { sourceId } : {}),
      });
      if (r.ok) {
        const body = (await r.json()) as { enqueued?: number };
        setState({ tone: "success", text: T.runNow.done(body.enqueued ?? 0) });
      } else {
        setState({
          tone: "error",
          text: r.status === 403 || r.status === 401 ? T.runNow.forbidden : T.runNow.failed,
        });
      }
    } catch {
      setState({ tone: "error", text: T.runNow.failed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="md" icon="play" onClick={run} disabled={busy}>
          {busy ? T.runNow.busy : label}
        </Button>
        <span className="type-meta text-meta">{T.runNow.hint}</span>
      </div>
      {state && (
        <InlineAlert tone={state.tone} role={state.tone === "error" ? "alert" : "status"}>
          {state.text}
        </InlineAlert>
      )}
    </div>
  );
}
