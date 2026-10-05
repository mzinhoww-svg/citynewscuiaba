import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "../cx";

export interface StatGridItem {
  label: string;
  value: ReactNode;
  /** Complemento curto abaixo do valor (período, variação). */
  hint?: ReactNode;
  /** Com destino, o bloco inteiro vira link (alvo ≥ 44 px). */
  href?: string;
}

export interface StatGridProps {
  items: readonly StatGridItem[];
  /** Colunas a partir de `md` (no celular são 2). Padrão 4. */
  columns?: 2 | 3 | 4 | 5;
  /** Nome da lista para leitor de tela, quando não há título visível ligado a ela. */
  "aria-label"?: string;
  className?: string;
}

const COLUMNS = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
} as const;

/**
 * Grade de números do Estúdio (item 30, D-06): `<dl>` com pares rótulo e valor em blocos
 * planos. Valor longo quebra (`break-words`) em vez de estourar o bloco.
 *
 * ```tsx
 * <StatGrid columns={5} items={[{ label: "Impressões", value: "1.200" }]} />
 * ```
 */
export function StatGrid({
  items,
  columns = 4,
  "aria-label": ariaLabel,
  className,
}: StatGridProps) {
  return (
    <dl
      aria-label={ariaLabel}
      className={cx("grid grid-cols-2 gap-3", COLUMNS[columns], className)}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cx(
            "flex min-w-0 flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4",
            item.href &&
              "relative min-h-tap motion-safe:transition-colors [--card-radius:var(--r-lg)] hover:bg-hover",
          )}
        >
          <dt className="type-meta text-meta break-words">
            {item.href ? (
              <Link href={item.href} className="card-link underline-offset-2 hover:underline">
                {item.label}
              </Link>
            ) : (
              item.label
            )}
          </dt>
          <dd className="type-headline-sm tabular-nums text-strong break-words">{item.value}</dd>
          {item.hint != null && <dd className="type-meta text-meta break-words">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
