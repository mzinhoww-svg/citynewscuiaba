"use client";

import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface AdminReply {
  ok: boolean;
  message: string;
}

/** Resultado da última ação (sucesso ou falha), anunciado sem interromper. */
export function AdminStatus({
  status,
  className,
}: {
  status: AdminReply | null;
  className?: string;
}) {
  return (
    <p
      role={status && !status.ok ? "alert" : "status"}
      aria-live="polite"
      className={cx("min-h-6 type-body empty:hidden", className)}
    >
      {status && (
        <span
          className={cx(
            "inline-flex items-start gap-2",
            status.ok ? "text-service" : "text-danger",
          )}
        >
          <Icon name={status.ok ? "check" : "circle-alert"} size={20} className="mt-0.5 shrink-0" />
          {status.message}
        </span>
      )}
    </p>
  );
}

export interface CheckOption {
  value: string;
  label: string;
}

/** Lista de caixas de seleção com rótulo de grupo (papéis, editorias, integrantes). */
export function CheckList({
  label,
  options,
  value,
  onChange,
  columns = 2,
}: {
  label: string;
  options: readonly CheckOption[];
  value: readonly string[];
  onChange: (next: string[]) => void;
  columns?: 1 | 2 | 3;
}) {
  const set = new Set(value);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="type-meta font-semibold text-strong">{label}</legend>
      <ul
        className={cx(
          "grid gap-x-4",
          columns === 1
            ? "grid-cols-1"
            : columns === 2
              ? "grid-cols-1 sm:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-3",
        )}
      >
        {options.map((o) => (
          <li key={o.value}>
            <label className="flex min-h-tap items-center gap-2.5 type-body text-strong">
              <input
                type="checkbox"
                checked={set.has(o.value)}
                onChange={(e) => {
                  const next = new Set(set);
                  if (e.target.checked) next.add(o.value);
                  else next.delete(o.value);
                  onChange(options.filter((x) => next.has(x.value)).map((x) => x.value));
                }}
                className="size-5 shrink-0 accent-action-primary"
              />
              {o.label}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** Tabela de dados das telas de administração: cabeçalhos `<th scope="col">` e rolagem horizontal. */
export function AdminTable({
  caption,
  headers,
  children,
  minWidth = "min-w-[40rem]",
}: {
  caption: string;
  headers: readonly string[];
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
    >
      <table className={cx("w-full border-collapse text-left", minWidth)}>
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta text-meta">
          <tr>
            {headers.map((h) => (
              <th key={h} scope="col" className="px-3 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
