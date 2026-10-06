"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { CONTROL_TEXT, stepLabel } from "@/content/pt-BR/control";
import {
  failureItemHref,
  failureKey,
  failureRunHref,
  groupFailures,
} from "@/lib/control/group-failures";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Table } from "../ui/Table";

const T = CONTROL_TEXT.failures;

export interface JobRow {
  kind: "quarantine" | "retrying";
  id: number;
  step: string;
  itemRef: string;
  runRef: string | null;
  attempts: number;
  error: string;
  at: string;
}

export interface ActionReply {
  ok: boolean;
  message: string;
}

export interface JobTableProps {
  rows: JobRow[];
  /** Ações de operação; ausente = só leitura (papel sem `source.manage`). */
  actions?: {
    retry: (i: { ids: number[]; keepHumanDecisions: boolean }) => Promise<ActionReply>;
    discard: (i: { ids: number[]; reason: string }) => Promise<ActionReply>;
  };
  className?: string;
}

const LINK = "inline-flex min-h-tap items-center text-link underline underline-offset-4";

function KindLabel({ kind }: { kind: JobRow["kind"] }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1",
        kind === "quarantine" ? "font-semibold text-danger" : "text-warn",
      )}
    >
      <Icon name={kind === "quarantine" ? "circle-alert" : "refresh-cw"} size={16} />
      {T.kind[kind]}
    </span>
  );
}

/** Links da falha: logs do objeto e detalhe da execução (item 54). */
function FailureLinks({ row }: { row: JobRow }) {
  const item = failureItemHref(row.itemRef);
  const run = failureRunHref(row.runRef);
  return (
    <span className="flex flex-wrap items-center gap-x-4">
      {item ? (
        <Link href={item} className={cx(LINK, "break-all")}>
          <span className="sr-only">{T.itemLogs}:</span> {row.itemRef}
        </Link>
      ) : (
        <span className="break-all">{row.itemRef}</span>
      )}
      {run && (
        <Link href={run} className={LINK}>
          {T.openRun} <span className="sr-only">{row.itemRef}</span>
        </Link>
      )}
    </span>
  );
}

/**
 * Falhas do pipeline (O06): quarentena e mensagens aguardando nova tentativa. Quem opera
 * seleciona mensagens em quarentena (uma a uma, por grupo ou todas) e reprocessa a partir da
 * etapa que falhou (mantendo decisões humanas por padrão) ou descarta com motivo. Resultado em
 * `role="status"`. Item 54: resumo agrupado por etapa e erro e links para o objeto e a execução.
 * Item 52: cartões abaixo de `md`, tabela a partir de `md` (a versão inativa fica `display:none`,
 * fora da árvore de acessibilidade).
 */
export function JobTable({ rows, actions, className }: JobTableProps) {
  const router = useRouter();
  const uid = useId();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [keepHuman, setKeepHuman] = useState(true);
  const [status, setStatus] = useState<ActionReply | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = [...selected];
  const quarantineIds = rows.filter((r) => r.kind === "quarantine").map((r) => r.id);
  const groups = useMemo(() => {
    const quarantineByKey = new Map<string, number[]>();
    for (const r of rows) {
      if (r.kind !== "quarantine") continue;
      const key = failureKey(r.step, r.error);
      quarantineByKey.set(key, [...(quarantineByKey.get(key) ?? []), r.id]);
    }
    return groupFailures(rows).map((g) => ({ ...g, quarantine: quarantineByKey.get(g.key) ?? [] }));
  }, [rows]);

  const finish = (r: ActionReply) => {
    setStatus(r);
    if (r.ok) setSelected(new Set());
    router.refresh();
  };
  const toggle = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const selectMany = (list: readonly number[]) =>
    setSelected((prev) => new Set([...prev, ...list]));
  const closeDiscard = () => {
    setDiscardOpen(false);
    setReason("");
    setReasonError(null);
  };

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <p role="status" aria-live="polite" className="min-h-6 type-body">
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

      {actions ? (
        <fieldset className="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-card-white p-4">
          <legend className="sr-only">{T.reprocess}</legend>
          <p className="w-full type-meta text-meta" aria-live="polite">
            {T.selected(ids.length)}
          </p>
          <Checkbox
            id={`${uid}-keep-human`}
            name="manter-decisoes"
            label={T.keepHuman}
            checked={keepHuman}
            onChange={setKeepHuman}
            hint={T.keepHumanHint}
            className="w-full"
          />
          <Button
            size="md"
            icon="refresh-cw"
            disabled={ids.length === 0 || pending}
            onClick={() =>
              start(async () => finish(await actions.retry({ ids, keepHumanDecisions: keepHuman })))
            }
          >
            {T.reprocess}
          </Button>
          <Button
            size="md"
            variant="outline"
            icon="trash-2"
            disabled={ids.length === 0 || pending}
            onClick={() => setDiscardOpen(true)}
          >
            {T.discard}
          </Button>
          <Button
            size="md"
            variant="text"
            disabled={quarantineIds.length === 0 || pending}
            onClick={() => selectMany(quarantineIds)}
          >
            {T.selectAll}
          </Button>
          {ids.length > 0 && (
            <Button size="md" variant="text" onClick={() => setSelected(new Set())}>
              {T.clearSelection}
            </Button>
          )}
        </fieldset>
      ) : (
        <p className="type-meta text-meta">{T.readOnly}</p>
      )}
      <p className="type-meta text-meta">{T.retryingNote}</p>

      {rows.length > 1 && (
        <section aria-labelledby={`${uid}-groups`} className="flex flex-col gap-2">
          <h2 id={`${uid}-groups`} className="type-label text-strong">
            {T.groupsTitle}
          </h2>
          <p className="type-meta text-meta">{T.groupsHint}</p>
          <ul
            aria-labelledby={`${uid}-groups`}
            className="flex flex-col rounded-lg border border-line-subtle bg-card-white"
          >
            {groups.map((g) => (
              <li
                key={g.key}
                className="flex flex-col gap-2 border-b border-line-subtle p-3 last:border-b-0 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="type-body font-semibold text-strong">
                    {stepLabel(g.step)}
                    <span className="font-normal text-meta"> · {T.occurrences(g.count)}</span>
                  </p>
                  <p className="type-meta text-body [overflow-wrap:anywhere]">
                    {g.message || T.noMessage}
                  </p>
                </div>
                {actions && g.quarantine.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 self-start md:self-center"
                    aria-label={T.selectGroupLabel(
                      g.quarantine.length,
                      `${stepLabel(g.step)} · ${g.message || T.noMessage}`,
                    )}
                    disabled={pending}
                    onClick={() => selectMany(g.quarantine)}
                  >
                    {T.selectGroup(g.quarantine.length)}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Celular (< md): cartões, sem rolagem horizontal. */}
      <ul aria-label={T.caption} className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <li
            key={`${r.kind}:${r.id}`}
            data-failure={r.kind}
            className="flex min-w-0 flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 type-body">
              <KindLabel kind={r.kind} />
              <span className="type-meta tabular-nums text-meta">{formatDateTime(r.at)}</span>
            </div>
            <p className="type-body font-semibold text-strong">{stepLabel(r.step)}</p>
            <p className="type-meta text-body [overflow-wrap:anywhere]">{r.error || T.noMessage}</p>
            <p className="type-meta text-meta">{T.attemptsN(r.attempts)}</p>
            <div className="type-meta">
              <FailureLinks row={r} />
            </div>
            {actions && r.kind === "quarantine" && (
              <Checkbox
                name="falha"
                label={
                  <>
                    {T.select}{" "}
                    <span className="sr-only">{`${stepLabel(r.step)} ${r.itemRef}`}</span>
                  </>
                }
                checked={selected.has(r.id)}
                onChange={(on) => toggle(r.id, on)}
              />
            )}
          </li>
        ))}
      </ul>

      <Table
        caption={T.caption}
        minWidth="lg"
        className="relative hidden md:block"
        headers={[
          ...(actions ? [{ label: T.col.select, srOnly: true }] : []),
          T.col.kind,
          T.col.step,
          T.col.item,
          T.col.error,
          { label: T.col.attempts, align: "right" as const },
          T.col.at,
        ]}
      >
        {rows.map((r) => (
          <tr
            key={`${r.kind}:${r.id}`}
            className="border-b border-line-subtle align-top last:border-b-0"
          >
            {actions && (
              <td className="px-3 py-3">
                {r.kind === "quarantine" && (
                  <input
                    type="checkbox"
                    aria-label={T.selectRow(`${stepLabel(r.step)} ${r.itemRef}`)}
                    checked={selected.has(r.id)}
                    onChange={(e) => toggle(r.id, e.target.checked)}
                    className="size-5 accent-(--action-primary)"
                  />
                )}
              </td>
            )}
            <td className="px-3 py-3 type-body">
              <KindLabel kind={r.kind} />
            </td>
            <th scope="row" className="px-3 py-3 type-body font-normal text-strong">
              {stepLabel(r.step)}
            </th>
            <td className="px-3 py-3 type-meta text-body">
              <FailureLinks row={r} />
            </td>
            <td className="px-3 py-3 type-meta max-w-md text-body">{r.error}</td>
            <td className="px-3 py-3 text-right type-body tabular-nums">{r.attempts}</td>
            <td className="px-3 py-3 type-body tabular-nums">{formatDateTime(r.at)}</td>
          </tr>
        ))}
      </Table>

      {actions && (
        <Dialog
          open={discardOpen}
          onClose={closeDiscard}
          title={T.discardConfirm}
          className="text-left"
          actions={
            <>
              <Button
                size="md"
                fullWidth
                disabled={pending}
                onClick={() => {
                  if (!reason.trim()) {
                    setReasonError(T.reasonRequired);
                    return;
                  }
                  start(async () => {
                    const r = await actions.discard({ ids, reason });
                    closeDiscard();
                    finish(r);
                  });
                }}
              >
                {T.discard}
              </Button>
              <Button size="md" variant="text" onClick={closeDiscard}>
                {T.cancel}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3 text-left">
            <p>{T.discardText}</p>
            <label htmlFor={`${uid}-reason`} className="type-label text-strong">
              {T.reason}
            </label>
            <textarea
              id={`${uid}-reason`}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError) setReasonError(null);
              }}
              rows={3}
              maxLength={500}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={reasonError ? `${uid}-reason-err` : undefined}
              className={cx(
                "border-control rounded-lg bg-input px-4 py-3 type-body text-strong",
                reasonError && "field-error",
              )}
            />
            {reasonError && (
              <p
                id={`${uid}-reason-err`}
                role="alert"
                className="flex gap-1.5 type-meta text-danger"
              >
                <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
                {reasonError}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
