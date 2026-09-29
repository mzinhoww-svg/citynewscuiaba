"use client";

import { useState } from "react";
import { ApproveChangeDialog, InlineAlert } from "@/components";
import type { ApprovalRequestView, FormAction } from "@/components";
import { APPROVE_DIALOG } from "@/content/pt-BR/sources-admin-detail";

export interface PendingApprovalItem extends ApprovalRequestView {
  stance: "decider" | "requester" | "observer";
}

export interface PendingApprovalsProps {
  items: readonly PendingApprovalItem[];
  /** `decideApprovalAction`. */
  decide: FormAction;
}

/** Pedidos de segunda aprovação desta fonte, com o diálogo de decisão de cada um. */
export function PendingApprovals({ items, decide }: PendingApprovalsProps) {
  // O pedido decidido some da lista quando a tela recarrega: a mensagem fica aqui, que continua montado.
  const [done, setDone] = useState<string | null>(null);
  const decideAndKeep: FormAction = async (fd) => {
    const r = await decide(fd);
    if (r.ok) setDone(r.message);
    return r;
  };
  return (
    <>
      {done && (
        <InlineAlert tone="success" role="status">
          {done}
        </InlineAlert>
      )}
      {items.length > 0 && (
        <section
          aria-label={APPROVE_DIALOG.title}
          className="flex flex-col gap-3 rounded-lg border border-line-section bg-atencao-soft p-4"
        >
          <h2 className="type-label text-16 text-strong">{APPROVE_DIALOG.title}</h2>
          <ul className="flex flex-col gap-3">
            {items.map(({ stance, ...request }) => (
              <li key={request.id}>
                <ApproveChangeDialog request={request} stance={stance} decide={decideAndKeep} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
