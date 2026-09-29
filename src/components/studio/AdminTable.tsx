import type { ReactNode } from "react";
import { cx } from "../cx";

export interface AdminTableProps {
  /** Nome da tabela para leitores de tela (legenda e região rolável). */
  caption: string;
  /** Títulos das colunas (`th scope="col"`). */
  columns: readonly string[];
  children: ReactNode;
  /** Largura mínima antes de rolar na horizontal (padrão 44rem). */
  wide?: boolean;
  className?: string;
}

/** Tabela das telas de Administração: região rolável e focável, legenda oculta, `th scope="col"`. */
export function AdminTable({
  caption,
  columns,
  children,
  wide = false,
  className,
}: AdminTableProps) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cx(
        "relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white",
        className,
      )}
    >
      <table
        className={cx("w-full border-collapse text-left", wide ? "min-w-[64rem]" : "min-w-[44rem]")}
      >
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta text-meta">
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" className="px-3 py-3">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
