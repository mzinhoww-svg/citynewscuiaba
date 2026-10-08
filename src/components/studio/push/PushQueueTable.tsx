"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clockTime, fullDateTime } from "@/content/pt-BR/sources-admin";
import { PUSH_ADMIN_TEXT, PUSH_QUEUE_TEXT as T } from "@/content/pt-BR/notifications-admin";
import type { QueueRow } from "@/lib/db/queries/push-admin";
import type { ActionFn, ActionState } from "@/lib/sources/action-state";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Table } from "../../ui/Table";
import { ActionMessage } from "../sources/fields";
import { DecideDialog, type DecideMode } from "./DecideDialog";
import { PushStatusBadge } from "./PushStatusBadge";

export interface PushQueueTableProps {
  rows: readonly QueueRow[];
  currentUserId: string;
  /** `push.approve`. */
  canApprove: boolean;
  /** `push.settings`: cancela qualquer envio. */
  canSettings: boolean;
  /** `decidePushAction`. */
  decide: ActionFn;
  /** `cancelPushAction`. */
  cancel: ActionFn;
  /** Intervalo do polling (ms); 0 desliga (testes). */
  pollMs?: number;
  className?: string;
}

const CANCELLABLE = new Set(["pending_approval", "queued", "scheduled", "dispatching", "paused"]);

/**
 * Fila e aprovações (spec §10.3): tabela com `<th scope="col">`, aprovação em texto ("Pendente"
 * ou "Aprovado por X às HH:MM"), ações por linha (Revisar, Cancelar) e `DecideDialog`. Atualiza a
 * cada 10 s com `router.refresh()` só com a aba visível e sem diálogo aberto (não perde foco);
 * anuncia em `aria-live` só quando a contagem muda.
 */
export function PushQueueTable({
  rows,
  currentUserId,
  canApprove,
  canSettings,
  decide,
  cancel,
  pollMs = 10_000,
  className,
}: PushQueueTableProps) {
  const router = useRouter();
  const [open, setOpen] = useState<{ row: QueueRow; mode: DecideMode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionState | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open !== null;
  }, [open]);
  const lastCount = useRef(rows.length);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    if (lastCount.current !== rows.length) {
      lastCount.current = rows.length;
      // Só quando a contagem muda (anúncio discreto, sem repetir a cada atualização).
      const t = window.setTimeout(() => setAnnounce(T.countChanged(rows.length)), 0);
      return () => window.clearTimeout(t);
    }
  }, [rows.length]);

  useEffect(() => {
    if (!pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || openRef.current) return;
      router.refresh();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, router]);

  const close = () => {
    setOpen(null);
    setError(null);
    if (trigger) setTimeout(() => trigger.focus(), 0);
  };

  async function run(action: ActionFn, values: Record<string, string>) {
    const form = new FormData();
    for (const [k, v] of Object.entries(values)) form.set(k, v);
    setBusy(true);
    let r: ActionState;
    try {
      r = await action(form);
    } catch {
      r = { ok: false, message: PUSH_ADMIN_TEXT.errors.unavailable };
    }
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    close();
    setResult(r);
    router.refresh();
  }

  const canCancel = (r: QueueRow) =>
    CANCELLABLE.has(r.status) && (r.requestedBy?.id === currentUserId || canSettings);

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <ActionMessage result={result} />
      {rows.length === 0 ? (
        <EmptyState title={T.empty} icon="bell">
          {T.emptyHint}
        </EmptyState>
      ) : (
        <Table
          caption={T.title}
          minWidth="xl"
          headers={Object.values(T.columns)}
          className="type-body"
        >
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line-section align-top">
              <td className="px-3 py-2 text-strong">{PUSH_ADMIN_TEXT.kind[r.kind]}</td>
              <td className="px-3 py-2 text-strong">
                {r.article.slug ? (
                  <Link
                    href={`/materia/${r.article.slug}`}
                    className="text-link underline-offset-4 hover:underline"
                  >
                    {r.article.title}
                  </Link>
                ) : (
                  r.article.title
                )}
              </td>
              <td className="px-3 py-2 text-strong">
                <p className="font-semibold">{r.title}</p>
                <p className="type-meta text-meta">{r.body}</p>
              </td>
              <td className="px-3 py-2 text-strong">
                {r.audienceLabel}
                {r.reach !== null && <p className="type-meta text-meta">{T.reach(r.reach)}</p>}
              </td>
              <td className="px-3 py-2 text-strong">
                {r.requestedBy?.name ?? "Sistema"}
                <p className="type-meta text-meta">{fullDateTime(r.requestedAt)}</p>
              </td>
              <td className="px-3 py-2 text-strong">
                {r.approvedBy && r.approvedAt
                  ? PUSH_ADMIN_TEXT.approval.by(r.approvedBy.name, clockTime(r.approvedAt))
                  : PUSH_ADMIN_TEXT.approval.pending}
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-strong">
                {r.scheduledAt ? fullDateTime(r.scheduledAt) : T.now}
              </td>
              <td className="px-3 py-2">
                <PushStatusBadge status={r.status} reason={r.statusReason} />
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  {/* A-128: decide quem tem push.approve, inclusive o próprio pedido. */}
                  {r.status === "pending_approval" && canApprove && (
                    <Button
                      size="sm"
                      variant="outline-strong"
                      aria-label={T.approve(r.title)}
                      onClick={(e) => {
                        setTrigger(e.currentTarget);
                        setError(null);
                        setOpen({ row: r, mode: "decide" });
                      }}
                    >
                      {T.review}
                    </Button>
                  )}
                  {canCancel(r) && (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={T.cancel(r.title)}
                      onClick={(e) => {
                        setTrigger(e.currentTarget);
                        setError(null);
                        setOpen({ row: r, mode: "cancel" });
                      }}
                    >
                      {T.dialog.cancel}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {open && (
        <DecideDialog
          open
          row={open.row}
          mode={open.mode}
          busy={busy}
          error={error}
          onCancel={close}
          onApprove={() => run(decide, { id: open.row.id, decision: "approve" })}
          onReject={(reason) => run(decide, { id: open.row.id, decision: "reject", reason })}
          onCancelSend={(reason) => run(cancel, { id: open.row.id, reason })}
        />
      )}
    </div>
  );
}
