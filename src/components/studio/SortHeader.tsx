import Link from "next/link";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface SortHeaderProps {
  label: string;
  /** Esta coluna é a ordenação atual? */
  active: boolean;
  dir: "asc" | "desc";
  /** Ordenação no servidor: link para a mesma tela com `?ordem=`. */
  href?: string;
  /** Ordenação no cliente: botão. */
  onSort?: () => void;
  /** Números alinham à direita. */
  numeric?: boolean;
  className?: string;
}

/**
 * Cabeçalho de tabela ordenável (`<th scope="col">` com `aria-sort`). É um link (servidor) ou um
 * botão (cliente); o estado atual aparece em ícone e no atributo, nunca só em cor.
 */
export function SortHeader({
  label,
  active,
  dir,
  href,
  onSort,
  numeric,
  className,
}: SortHeaderProps) {
  const aria = active ? (dir === "asc" ? "ascending" : "descending") : "none";
  const inner = (
    <>
      {label}
      <span aria-hidden="true" className={cx("inline-block size-4", !active && "opacity-0")}>
        <Icon
          name="chevron-down"
          size={16}
          className={cx(active && dir === "asc" && "rotate-180")}
        />
      </span>
    </>
  );
  const cls = cx(
    "inline-flex min-h-tap items-center gap-1 rounded-sm text-left text-inherit",
    "hover:text-strong",
    numeric && "flex-row-reverse",
  );
  return (
    <th
      scope="col"
      aria-sort={aria}
      className={cx("px-3 py-1 type-meta text-meta", numeric && "text-right", className)}
    >
      {href ? (
        <Link href={href} className={cx(cls, "no-underline")}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onSort} className={cls}>
          {inner}
        </button>
      )}
    </th>
  );
}
