"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatWeight, REC_TEXT as T, WEIGHT_TEXT } from "@/content/pt-BR/recommendation-admin";
import { WEIGHT_KEYS } from "@/lib/ranking/score";
import type { Weights } from "@/lib/ranking/types";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { RecReply } from "./WeightSliders";

export interface WeightsHistoryItem {
  version: string;
  weights: Weights | null;
  proposedBy: { id: string; name: string | null };
  approvedBy: { id: string; name: string | null } | null;
  active: boolean;
  createdAt: string;
  approval: { id: string; status: string; requestedBy: string } | null;
}

export interface WeightsHistoryProps {
  rows: WeightsHistoryItem[];
  canApprove: boolean;
  activate: (i: { approvalId: string }) => Promise<RecReply>;
  className?: string;
}

/** Histórico de pesos (O17) com ativação por quem tem o papel de aprovar (A-128: pode ser quem propôs). */
export function WeightsHistory({ rows, canApprove, activate, className }: WeightsHistoryProps) {
  const router = useRouter();
  const [status, setStatus] = useState<RecReply | null>(null);
  const [busy, start] = useTransition();
  const who = (p: { name: string | null } | null) => p?.name ?? T.someone;
  const statusOf = (r: WeightsHistoryItem) =>
    r.active ? T.status.active : r.approvedBy ? T.status.approved : T.status.pending;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <p
        role={status && !status.ok ? "alert" : "status"}
        aria-live="polite"
        className="min-h-6 type-body empty:hidden"
      >
        {status && (
          <span
            className={cx(
              "inline-flex items-start gap-2",
              status.ok ? "text-service" : "text-danger",
            )}
          >
            <Icon name={status.ok ? "check" : "circle-alert"} size={20} className="mt-0.5" />
            {status.message}
          </span>
        )}
      </p>
      <div
        role="region"
        aria-label={T.historyCaption}
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
      >
        <table className="w-full min-w-[64rem] border-collapse text-left">
          <caption className="sr-only">{T.historyCaption}</caption>
          <thead className="border-b border-line-subtle bg-section type-meta text-meta">
            <tr>
              {(
                [
                  "version",
                  "weights",
                  "proposedBy",
                  "approvedBy",
                  "status",
                  "when",
                  "actions",
                ] as const
              ).map((k) => (
                <th key={k} scope="col" className="px-3 py-3">
                  {T.historyCol[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ap = r.approval;
              return (
                <tr key={r.version} className="border-b border-line-subtle last:border-0 align-top">
                  <th
                    scope="row"
                    className="px-3 py-3 type-body font-medium text-strong whitespace-nowrap"
                  >
                    {r.version}
                  </th>
                  <td className="px-3 py-3 type-meta text-body">
                    {r.weights
                      ? WEIGHT_KEYS.map(
                          (k) => `${WEIGHT_TEXT[k].label} ${formatWeight(r.weights![k])}`,
                        ).join(" · ")
                      : "—"}
                  </td>
                  <td className="px-3 py-3 type-body">{who(r.proposedBy)}</td>
                  <td className="px-3 py-3 type-body">{r.approvedBy ? who(r.approvedBy) : "—"}</td>
                  <td
                    className={cx(
                      "px-3 py-3 type-body whitespace-nowrap",
                      r.active ? "font-semibold text-service" : "text-body",
                    )}
                  >
                    {statusOf(r)}
                  </td>
                  <td className="px-3 py-3 type-meta text-meta whitespace-nowrap">
                    {formatDateTime(r.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    {ap && ap.status === "pending" && !canApprove && (
                      <span className="type-meta text-strong">{T.waitApprover}</span>
                    )}
                    {ap && ap.status === "pending" && canApprove && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          start(async () => {
                            const x = await activate({ approvalId: ap.id });
                            setStatus(x);
                            if (x.ok) router.refresh();
                          })
                        }
                      >
                        {T.approveAndActivate(r.version)}
                      </Button>
                    )}
                    {ap && ap.status === "approved" && canApprove && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          start(async () => {
                            const x = await activate({ approvalId: ap.id });
                            setStatus(x);
                            if (x.ok) router.refresh();
                          })
                        }
                      >
                        {T.activate(r.version)}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
