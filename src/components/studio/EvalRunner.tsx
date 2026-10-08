"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Select, type SelectOption } from "../ui/Select";
import { Table } from "../ui/Table";

export interface EvalReply {
  ok: boolean;
  message: string;
}

export interface EvalRunnerProps {
  versions: SelectOption[];
  defaultVersion: string;
  labels: { version: string; run: string; running: string };
  run: (i: { promptVersion?: number }) => Promise<EvalReply>;
  className?: string;
}

/** Rodar a avaliação (O14) com a versão de prompt escolhida; resultado em `role="status"`. */
export function EvalRunner({ versions, defaultVersion, labels, run, className }: EvalRunnerProps) {
  const uid = useId();
  const router = useRouter();
  const [version, setVersion] = useState(defaultVersion);
  const [status, setStatus] = useState<EvalReply | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={cx("flex flex-col gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await run(version ? { promptVersion: Number(version) } : {});
          setStatus(r);
          if (r.ok) router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <Select
          id={`${uid}-version`}
          name="versao"
          label={labels.version}
          options={versions}
          value={version}
          onChange={setVersion}
          className="min-w-64"
        />
        <Button type="submit" size="md" icon="flask-conical" disabled={pending}>
          {pending ? labels.running : labels.run}
        </Button>
      </div>
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
    </form>
  );
}

export interface EvalCaseItem {
  id: string;
  key: string;
  question: string;
  expect: string;
  sources: number;
  active: boolean;
  /** Nome acessível do interruptor (ex.: "Desativar o caso viaduto-prazo"). */
  toggleLabel: string;
}

export interface EvalCasesTableProps {
  caption: string;
  columns: { key: string; question: string; expect: string; sources: string; active: string };
  rows: EvalCaseItem[];
  /** Ausente = só leitura. */
  toggle?: (i: { id: string; active: boolean }) => Promise<EvalReply>;
}

/** Casos de regressão (O14) com o interruptor de ativo para quem assina prompt. */
export function EvalCasesTable({ caption, columns, rows, toggle }: EvalCasesTableProps) {
  const router = useRouter();
  const [status, setStatus] = useState<EvalReply | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <p role="status" aria-live="polite" className="min-h-6 type-meta">
        {status && (
          <span className={status.ok ? "text-service" : "text-danger"}>{status.message}</span>
        )}
      </p>
      <Table
        caption={caption}
        minWidth="md"
        headers={[
          columns.key,
          columns.question,
          columns.expect,
          { label: columns.sources, align: "right" },
          columns.active,
        ]}
      >
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-line-subtle align-top last:border-b-0">
            <th scope="row" className="px-3 py-2 type-meta font-semibold text-strong">
              {r.key}
            </th>
            <td className="px-3 py-2 type-body text-body">{r.question}</td>
            <td className="px-3 py-2 type-meta text-body">{r.expect}</td>
            <td className="px-3 py-2 text-right type-body tabular-nums">{r.sources}</td>
            <td className="px-3 py-2">
              <input
                type="checkbox"
                checked={r.active}
                disabled={!toggle || pending}
                aria-label={r.toggleLabel}
                onChange={(e) => {
                  if (!toggle) return;
                  const active = e.target.checked;
                  start(async () => {
                    const out = await toggle({ id: r.id, active });
                    setStatus(out);
                    if (out.ok) router.refresh();
                  });
                }}
                className="size-5 accent-(--action-primary)"
              />
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
