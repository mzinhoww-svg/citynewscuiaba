"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CRITICAL_FIELD_TEXT,
  criticalValueText,
  SOURCE_ACTION_TEXT,
} from "@/content/pt-BR/sources-admin";
import { DETAIL_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import type { ActionFn, ActionState } from "@/lib/sources/action-state";
import type { PendingSourceApproval } from "@/lib/db/queries/sources-admin";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ApproveChangeDialog } from "./ApproveChangeDialog";
import { ActionMessage } from "./fields";

export interface PendingApprovalsPanelProps {
  approvals: readonly PendingSourceApproval[];
  /** Valor atual de cada coluna crítica (`image_policy` → "none"), para o diff. */
  currentValues: Record<string, string>;
  currentUserId: string;
  /** `source.approve_critical` (admin e editor-chefe). */
  canApprove: boolean;
  /** `decideApprovalAction` (FS-T6). */
  action: ActionFn;
  className?: string;
}

/**
 * Banner "Aguardando segunda aprovação" do detalhe (spec §7.5): uma linha por pedido com quem
 * pediu e "Revisar", que abre o diálogo de aprovar/recusar. A pessoa que pediu vê o aviso de que
 * a aprovação precisa ser de outra pessoa; quem não pode aprovar só lê.
 */
export function PendingApprovalsPanel({
  approvals,
  currentValues,
  currentUserId,
  canApprove,
  action,
  className,
}: PendingApprovalsPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState<PendingSourceApproval | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionState | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  // Depois de aprovar/recusar, `router.refresh()` esvazia a lista; o resultado continua visível
  // (senão o `role="status"` some junto com o painel antes de a pessoa ler).
  if (approvals.length === 0 && result === null) return null;

  const close = () => {
    setOpen(null);
    setError(null);
    if (trigger) setTimeout(() => trigger.focus(), 0);
  };

  async function decide(id: string, decision: "approve" | "reject", reason?: string) {
    const form = new FormData();
    form.set("id", id);
    form.set("decision", decision);
    if (reason) form.set("reason", reason);
    setBusy(true);
    let r: ActionState;
    try {
      r = await action(form);
    } catch {
      r = { ok: false, message: SOURCE_ACTION_TEXT.unavailable };
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

  return (
    <section aria-label={T.pending.title(approvals.length)} className={className}>
      {approvals.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-warn bg-atencao-soft px-4 py-3">
          <p className="flex items-center gap-2 type-body font-semibold text-strong">
            <Icon name="shield" size={18} className="text-warn" />
            {T.pending.title(approvals.length)}
          </p>
          <ul className="flex flex-col gap-2">
            {approvals.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 type-body text-strong"
              >
                <span>
                  {T.pending.line(
                    CRITICAL_FIELD_TEXT[a.field] ?? a.field,
                    criticalValueText(a.field, a.value),
                    a.requestedBy.name ?? T.pending.someone,
                  )}
                </span>
                {canApprove && (
                  <Button
                    size="sm"
                    variant="outline-strong"
                    onClick={(e) => {
                      setTrigger(e.currentTarget);
                      setOpen(a);
                    }}
                  >
                    {T.pending.review}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3 empty:hidden">
        <ActionMessage result={result} />
      </div>
      {open && (
        <ApproveChangeDialog
          open
          approval={{
            id: open.id,
            field: open.field,
            value: open.value,
            requestedBy: open.requestedBy,
            justification: open.justification,
            createdAt: open.createdAt,
          }}
          currentValue={currentValues[open.field] ?? null}
          isOwnRequest={open.requestedBy.id === currentUserId}
          busy={busy}
          error={error}
          onCancel={close}
          onApprove={() => decide(open.id, "approve")}
          onReject={(reason) => decide(open.id, "reject", reason)}
        />
      )}
    </section>
  );
}
