import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon } from "./Icon";

/**
 * Moldura comum dos campos de formulário (item 25, D-03): rótulo visível acima, controle, dica e
 * erro. A dica tem `id="<id>-dica"` e o erro `id="<id>-erro"`; o controle aponta para eles com
 * `aria-describedby={describedBy(id, hint, error)}` e marca `aria-invalid` quando há erro (item 26).
 *
 * ```tsx
 * <FieldShell id="nome" label="Nome" hint="Como aparece no site" error={erro}>
 *   <input id="nome" aria-invalid={erro ? true : undefined} aria-describedby={describedBy("nome", hint, erro)} />
 * </FieldShell>
 * ```
 */

/** Ids de dica e erro de um campo, na ordem em que aparecem; `undefined` quando não há nenhum. */
export function describedBy(
  id: string,
  hint?: ReactNode,
  error?: string | null,
): string | undefined {
  return (
    [hint ? `${id}-dica` : null, error ? `${id}-erro` : null].filter(Boolean).join(" ") || undefined
  );
}

export interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Campo obrigatório: marcado em `data-required` (o controle leva o `required` nativo). */
  required?: boolean;
  /** Conteúdo à direita do rótulo (selo "Mudança crítica", "opcional"). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  aside,
  children,
  className,
}: FieldShellProps) {
  return (
    <div
      className={cx("flex min-w-0 flex-col gap-2", className)}
      data-required={required ? "" : undefined}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <label htmlFor={id} className="type-label text-strong">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint && (
        <div id={`${id}-dica`} className="type-meta text-meta">
          {hint}
        </div>
      )}
      <FieldError id={id} error={error} />
    </div>
  );
}

/** Mensagem de erro do campo: ícone de 16 px e texto, nunca só cor. */
export function FieldError({ id, error }: { id: string; error?: string | null }) {
  if (!error) return null;
  return (
    <p id={`${id}-erro`} className="flex items-start gap-1.5 type-meta text-danger">
      <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
      {error}
    </p>
  );
}
