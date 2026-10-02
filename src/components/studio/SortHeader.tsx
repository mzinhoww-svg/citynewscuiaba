"use client";

import { useMemo, useState } from "react";
import { CONTROL_TEXT as T } from "@/content/pt-BR/control";
import { nextSort, sortRows, type SortDir, type SortState } from "@/lib/control";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface SortHeaderProps<K extends string> {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
  /** Números alinhados à direita. */
  numeric?: boolean;
}

/**
 * Cabeçalho de coluna ordenável: `<th scope="col" aria-sort>` com um botão que anuncia a
 * ordem. A seta muda de forma (não só de cor) e a ordem atual também vai em texto oculto.
 *
 * ```tsx
 * <SortHeader label="Fonte" column="name" sort={sort} onSort={setSortKey} />
 * ```
 */
export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  className,
  numeric,
}: SortHeaderProps<K>) {
  const active = sort.key === column;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className={cx("px-1 py-1", className)}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cx(
          "inline-flex min-h-tap w-full items-center gap-1 rounded-sm px-2 font-semibold text-meta hover:text-strong",
          numeric && "justify-end",
          active && "text-strong",
        )}
      >
        {label}
        <Icon
          name={active ? (sort.dir === "asc" ? "arrow-up" : "arrow-down") : "arrow-up-down"}
          size={14}
        />
        <span className="sr-only">
          {active ? `, ${sort.dir === "asc" ? T.sortedAsc : T.sortedDesc}` : ""}
        </span>
      </button>
    </th>
  );
}

/** Estado de ordenação de uma tabela: clicar na mesma coluna inverte a ordem. */
export function useSort<T, K extends string>(
  rows: readonly T[],
  initial: { key: K; dir: SortDir },
  value: (row: T, key: K) => string | number | null | undefined,
) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const sorted = useMemo(
    () => sortRows(rows, (r) => value(r, sort.key), sort.dir),
    // `value` é estável por tabela (função de módulo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort],
  );
  return { sort, sorted, onSort: (key: K) => setSort((s) => nextSort(s, key)) };
}
