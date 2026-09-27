import type { CSSProperties } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface StatCardProps {
  icon: IconName;
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
  className?: string;
  style?: CSSProperties;
}

/**
 * Bloco de métrica para estatísticas de autor e redação: ícone, rótulo, valor e variação.
 *
 * ```tsx
 * <StatCard icon="eye" label="Visualizações" value="213 mil" delta="+12%" />
 * <StatCard icon="users" label="Seguidores" value="400" delta="-0,2%" trend="down" />
 * ```
 * - A variação tem seta e texto ("alta", "queda") além da cor.
 */
export function StatCard({
  icon,
  label,
  value,
  delta,
  trend = "up",
  className,
  style,
}: StatCardProps) {
  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-lg border border-line-subtle bg-card-white p-4",
        className,
      )}
      style={style}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-pill bg-section text-strong"
      >
        <Icon name={icon} size={20} />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-13 leading-none text-meta">{label}</span>
        <span className="flex items-baseline gap-1.5">
          <strong className="text-18 font-bold leading-none tabular-nums text-strong">
            {value}
          </strong>
          {delta && (
            <span
              className={cx(
                "inline-flex items-center gap-0.5 type-meta tabular-nums",
                trend === "up" ? "text-service" : "text-danger",
              )}
            >
              <Icon name={trend === "up" ? "trending-up" : "trending-down"} size={14} />
              {delta}
              <span className="sr-only">{trend === "up" ? UI.trendUp : UI.trendDown}</span>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
