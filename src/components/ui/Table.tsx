import type { ReactNode } from "react";
import { cx } from "../cx";

export type TableHeader =
  | string
  | {
      label: string;
      /** Rótulo só para leitor de tela (coluna de ações, por exemplo). */
      srOnly?: boolean;
      align?: "left" | "right";
    };

export type TableMinWidth = "sm" | "md" | "lg" | "xl";

/** Largura mínima da tabela antes de rolar na horizontal (36, 44, 52 e 64 rem). */
const MIN_WIDTH: Record<TableMinWidth, string> = {
  sm: "table-sm",
  md: "table-md",
  lg: "table-lg",
  xl: "table-xl",
};

export interface TableProps {
  /** Legenda obrigatória: nomeia a tabela e a região rolável. */
  caption: string;
  headers: readonly TableHeader[];
  /** Largura mínima antes de rolar; sem ela, a tabela ocupa a largura do contêiner. */
  minWidth?: TableMinWidth;
  /** Mostra a legenda na tela (por padrão ela é só para leitor de tela). */
  captionVisible?: boolean;
  /**
   * Classe extra do `<table>`. Transição para `AdminTable`, que ainda recebe a largura mínima
   * como classe; código novo usa `minWidth`.
   */
  tableClassName?: string;
  className?: string;
  /** Linhas (`<tr>`) do corpo. */
  children: ReactNode;
}

/**
 * Tabela de dados (D-08): legenda obrigatória, região rolável focável pelo teclado com o nome da
 * legenda, cabeçalhos `<th scope="col">` e texto longo que quebra dentro da célula.
 *
 * ```tsx
 * <Table caption="Fontes cadastradas" headers={["Fonte", { label: "Itens", align: "right" }]} minWidth="md">
 *   {rows.map((r) => <tr key={r.id}>…</tr>)}
 * </Table>
 * ```
 */
export function Table({
  caption,
  headers,
  minWidth,
  captionVisible = false,
  tableClassName,
  className,
  children,
}: TableProps) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cx(
        "overflow-x-auto rounded-lg border border-line-subtle bg-card-white",
        className,
      )}
    >
      <table
        className={cx(
          "w-full border-collapse text-left [&_td]:[overflow-wrap:anywhere]",
          minWidth && MIN_WIDTH[minWidth],
          tableClassName,
        )}
      >
        <caption
          className={cx(
            captionVisible
              ? "px-3 pt-3 pb-2 text-left type-meta font-semibold text-strong"
              : "sr-only",
          )}
        >
          {caption}
        </caption>
        <thead className="border-b border-line-subtle bg-section type-meta text-meta">
          <tr>
            {headers.map((h, i) => {
              const header = typeof h === "string" ? { label: h } : h;
              return (
                <th
                  key={`${i}-${header.label}`}
                  scope="col"
                  className={cx(
                    "px-3 py-3 font-semibold",
                    header.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {header.srOnly ? <span className="sr-only">{header.label}</span> : header.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
