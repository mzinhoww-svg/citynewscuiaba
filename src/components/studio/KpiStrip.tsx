import Link from "next/link";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface KpiItem {
  label: string;
  value: number;
  icon: IconName;
  /** Link para a aba ou filtro correspondente da fila. */
  href?: string;
  /** Destaca o número que pede ação (ex.: prazo vencido > 0). */
  attention?: boolean;
}

export interface KpiStripProps {
  label: string;
  items: KpiItem[];
  className?: string;
}

/**
 * Faixa de indicadores do dia no Newsroom (E01). Cada número é um link para a fila filtrada;
 * destaque de atenção usa ícone e peso, não só cor.
 *
 * ```tsx
 * <KpiStrip label="Indicadores do dia" items={[{ label: "Publicadas hoje", value: 4, icon: "newspaper" }]} />
 * ```
 */
export function KpiStrip({ label, items, className }: KpiStripProps) {
  return (
    <section aria-label={label} className={className}>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {items.map((it) => {
          const body = (
            <>
              <span className="flex items-center gap-2 type-meta text-meta">
                <Icon name={it.attention ? "triangle-alert" : it.icon} size={16} />
                {it.label}
              </span>
              <span
                className={cx(
                  "text-28 font-bold tabular-nums leading-tight",
                  it.attention ? "text-warn" : "text-strong",
                )}
              >
                {it.value}
              </span>
            </>
          );
          return (
            <li key={it.label}>
              {it.href ? (
                <Link
                  href={it.href}
                  className="flex h-full min-h-tap flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4 no-underline hover:border-line-control"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex h-full flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
