"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ACTIONS_BY_KEY,
  CONTINGENCY as T,
  FLAG_LABELS,
  RUNBOOKS,
  RUNBOOK_BASE,
  type ContingencyAction,
} from "@/content/pt-BR/contingency";
import { formatDateTime } from "@/lib/format/date";
import { CONTINGENCY_KEYS, SAFE_VALUE, type ContingencyKey, type FlagKey } from "@/lib/flags/keys";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";
import { AdminBlock } from "./AdminFields";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";
import { ConfirmByTypingDialog } from "./sources/ConfirmByTypingDialog";
import type { FormAction } from "./sources/detail-shared";

export interface ContingencyFlagRow {
  key: FlagKey;
  enabled: boolean | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface ContingencyPanelProps {
  flags: readonly ContingencyFlagRow[];
  isAdmin: boolean;
  /** `setContingencyAction`. */
  action: FormAction;
  pendingApprovals: number;
}

const isContingency = (k: FlagKey): k is ContingencyKey =>
  (CONTINGENCY_KEYS as readonly string[]).includes(k);

/** Ação a oferecer: se a chave já está no sentido seguro, oferece voltar; senão, oferece parar. */
function nextAction(key: ContingencyKey, enabled: boolean): ContingencyAction {
  const pair = ACTIONS_BY_KEY[key];
  return enabled === SAFE_VALUE[key] ? pair.resume : pair.stop;
}

/**
 * Contingência (A15): estado de cada chave (quem mudou e quando) e os botões de emergência, todos
 * com confirmação digitando o nome da ação e motivo. Sem papel de admin, só leitura.
 */
export function ContingencyPanel({
  flags,
  isAdmin,
  action,
  pendingApprovals,
}: ContingencyPanelProps) {
  const router = useRouter();
  const [open, setOpen] = useState<ContingencyKey | null>(null);
  const byKey = new Map(flags.map((f) => [f.key, f]));
  const others = flags.filter((f) => !isContingency(f.key));

  return (
    <div className="flex flex-col gap-10">
      <AdminBlock id="cont-actions" title={T.actionsTitle}>
        {!isAdmin && <p className="type-meta text-meta">{T.adminOnly}</p>}
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {CONTINGENCY_KEYS.map((key) => {
            const st = byKey.get(key);
            if (!st || st.enabled === null) return null;
            const a = nextAction(key, st.enabled);
            const runbook = `${RUNBOOK_BASE}/${a.runbook}.md`;
            return (
              <li
                key={key}
                className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-card-white p-4"
              >
                <h3 className="type-headline-sm text-strong">{FLAG_LABELS[key]}</h3>
                <p className="type-meta text-meta">
                  {st.enabled ? T.on : T.off}. {a.effect}
                </p>
                <p className="type-meta text-meta">{a.revert}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="md"
                    variant={key === "auto_publish" || key === "read_only" ? "primary" : "outline"}
                    disabled={!isAdmin}
                    onClick={() => setOpen(key)}
                  >
                    {a.button}
                  </Button>
                  <a className="type-label text-16 text-strong underline" href={runbook}>
                    {T.runbook}
                  </a>
                </div>
                <ConfirmByTypingDialog
                  open={open === key}
                  onClose={() => setOpen(null)}
                  title={a.title}
                  intro={a.intro}
                  confirmText={a.confirmText}
                  confirmLabel={T.confirmLabel}
                  confirmHint={a.confirmText}
                  reasonLabel={T.reasonLabel}
                  reasonHint={T.reasonHint}
                  submitLabel={a.submit}
                  action={action}
                  hidden={{ key, value: String(a.value) }}
                  onDone={() => router.refresh()}
                />
              </li>
            );
          })}
          <li className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-card-white p-4">
            <h3 className="type-headline-sm text-strong">{T.rollbackTitle}</h3>
            <p className="type-meta text-meta">{T.rollbackBody}</p>
            {pendingApprovals > 0 && (
              <p className="type-meta text-strong">
                {T.rollbackApprovals}: {pendingApprovals}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button href="/estudio/control/regras" size="md" variant="outline">
                {T.rollbackAction}
              </Button>
              <a
                className="type-label text-16 text-strong underline"
                href={`${RUNBOOK_BASE}/rollback-regras.md`}
              >
                {T.runbook}
              </a>
            </div>
          </li>
        </ul>
      </AdminBlock>

      <AdminBlock id="cont-state" title={T.stateTitle}>
        <AiOpsTable
          caption={T.stateCaption}
          minWidthClass="min-w-[44rem]"
          columns={[T.colFlag, T.colState, T.colBy, T.colAt]}
        >
          {flags.map((f) => (
            <tr key={f.key} className={ROW}>
              <th scope="row" className={`${CELL} font-semibold text-strong`}>
                {FLAG_LABELS[f.key]}
              </th>
              <td className={CELL}>{f.enabled === null ? "—" : f.enabled ? T.on : T.off}</td>
              <td className={CELL}>
                {f.updatedAt ? (f.updatedByName ?? T.unknownPerson) : T.neverChanged}
              </td>
              <td className={`${CELL} tabular-nums`}>
                {f.updatedAt ? formatDateTime(f.updatedAt) : "—"}
              </td>
            </tr>
          ))}
        </AiOpsTable>
        {others.length > 0 && (
          <InlineAlert tone="info" role="none">
            {T.otherFlagsBody}
          </InlineAlert>
        )}
      </AdminBlock>

      <AdminBlock id="cont-runbooks" title={T.runbooksTitle}>
        <p className="type-body text-meta">{T.runbooksIntro}</p>
        <ul className="flex flex-col gap-2 type-body">
          {RUNBOOKS.map((r) => (
            <li key={r.slug}>
              <a className="text-strong underline" href={`${RUNBOOK_BASE}/${r.slug}.md`}>
                {r.title}
              </a>
            </li>
          ))}
        </ul>
      </AdminBlock>
    </div>
  );
}
