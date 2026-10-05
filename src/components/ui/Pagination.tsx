import Link from "next/link";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon } from "./Icon";

export interface PaginationProps {
  /** Página atual, a partir de 1. */
  page: number;
  totalPages: number;
  /** Endereço de cada página (link comum, funciona sem JavaScript). */
  hrefFor: (page: number) => string;
  /** Nome do `nav` (ex.: "Paginação das fontes"). */
  label: string;
  className?: string;
}

type Slot = number | "gap";

/** Números mostrados: primeira, última e vizinhas da atual; o resto vira reticências. */
export function paginationSlots(page: number, totalPages: number): Slot[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const keep = [1, page - 1, page, page + 1, totalPages]
    .filter((p) => p >= 1 && p <= totalPages)
    .filter((p, i, all) => all.indexOf(p) === i)
    .sort((a, b) => a - b);
  const slots: Slot[] = [];
  keep.forEach((p, i) => {
    const prev = keep[i - 1];
    if (prev !== undefined && p - prev === 2) slots.push(prev + 1);
    else if (prev !== undefined && p - prev > 2) slots.push("gap");
    slots.push(p);
  });
  return slots;
}

const stepLink = cx(
  "inline-flex min-h-tap items-center gap-1 rounded-md px-2 type-body font-semibold text-link",
  "no-underline hover:underline",
);

const numberBox = "inline-flex size-tap items-center justify-center rounded-md type-body";

/**
 * Paginação numerada (D-21): `nav` com "Anterior", os números e "Próxima", mais o texto
 * "Página X de Y". Só links, sem JavaScript. Para lista que cresce na mesma página, use `LoadMore`.
 *
 * ```tsx
 * <Pagination page={page} totalPages={totalPages} label="Paginação das fontes"
 *   hrefFor={(p) => `/estudio/control/fontes?pagina=${p}`} />
 * ```
 */
export function Pagination({ page, totalPages, hrefFor, label, className }: PaginationProps) {
  if (totalPages <= 1) return null;
  const current = Math.min(Math.max(1, page), totalPages);
  const T = UI.pagination;

  return (
    <nav
      aria-label={label}
      className={cx("flex flex-wrap items-center justify-between gap-x-4 gap-y-2", className)}
    >
      {current > 1 ? (
        <Link href={hrefFor(current - 1)} aria-label={T.prevLabel} className={stepLink}>
          <Icon name="chevron-left" size={18} />
          {T.prev}
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}

      <div className="flex items-center gap-3">
        <ol className="hidden items-center gap-1 sm:flex">
          {paginationSlots(current, totalPages).map((slot, i) => (
            <li key={slot === "gap" ? `gap-${i}` : slot}>
              {slot === "gap" ? (
                <span className={cx(numberBox, "text-meta")}>…</span>
              ) : slot === current ? (
                <span
                  aria-current="page"
                  className={cx(numberBox, "bg-action-primary font-semibold text-on-inverse")}
                >
                  {slot}
                </span>
              ) : (
                <Link
                  href={hrefFor(slot)}
                  aria-label={T.page(slot)}
                  className={cx(numberBox, "text-strong no-underline hover:bg-hover")}
                >
                  {slot}
                </Link>
              )}
            </li>
          ))}
        </ol>
        <p className="type-meta text-meta">{T.of(current, totalPages)}</p>
      </div>

      {current < totalPages ? (
        <Link href={hrefFor(current + 1)} aria-label={T.nextLabel} className={stepLink}>
          {T.next}
          <Icon name="chevron-right" size={18} />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
