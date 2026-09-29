import type { ReactNode } from "react";

export interface AiOpsTableProps {
  caption: string;
  columns: readonly string[];
  /** Largura mínima em rem antes de rolar na horizontal. */
  minWidthClass?: string;
  children: ReactNode;
}

/**
 * Tabela das telas de IA do Control Center (conhecimento, avaliações, custos, governança):
 * região rolável com foco, legenda para leitores de tela e `th scope="col"`. A primeira célula
 * de cada linha deve ser `<th scope="row">`.
 */
export function AiOpsTable({
  caption,
  columns,
  minWidthClass = "min-w-[40rem]",
  children,
}: AiOpsTableProps) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
    >
      <table className={`w-full ${minWidthClass} border-collapse text-left`}>
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

export const CELL = "px-3 py-3 type-body";
export const ROW = "border-b border-line-subtle align-top last:border-b-0";
