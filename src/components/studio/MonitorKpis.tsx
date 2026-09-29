import Link from "next/link";
import { brl, MONITOR_TEXT as T, RUN_STATE_LABEL } from "@/content/pt-BR/control-monitor";
import type { LiveSnapshot } from "@/lib/control/types";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

interface Tile {
  key: string;
  label: string;
  value: string;
  note?: string;
  icon: IconName;
  attention?: boolean;
  href?: string;
}

/** Indicadores do motor (O01/O02): número grande, rótulo e nota; atenção com ícone, não só cor. */
export function MonitorKpis({ snap, className }: { snap: LiveSnapshot; className?: string }) {
  const n = snap.numbers;
  const tiles: Tile[] = [
    {
      key: "run",
      label: T.kpi.lastRun,
      value: snap.lastRun ? RUN_STATE_LABEL[snap.lastRun.status] : T.overview.noRun,
      note: `${T.kpi.age(snap.ageMinutes)} · ${snap.late ? T.kpi.late : T.kpi.onTime}`,
      icon: "clock",
      attention: snap.late,
      href: "/estudio/control/execucoes",
    },
    {
      key: "queue",
      label: T.kpi.queue,
      value: String(snap.pendingTotal),
      icon: "layers",
      href: "/estudio/control/tempo-real",
    },
    {
      key: "quarantine",
      label: T.kpi.quarantine,
      value: String(snap.quarantineOpen),
      icon: "shield",
      attention: snap.quarantineOpen > 0,
      href: "/estudio/control/falhas",
    },
    {
      key: "errors",
      label: T.kpi.errors1h,
      value: String(n.errors1h),
      icon: "circle-alert",
      attention: n.errors1h > 0,
      href: "/estudio/control/logs?nivel=error",
    },
    {
      key: "security",
      label: T.kpi.security24h,
      value: String(n.security24h),
      icon: "lock",
      attention: n.security24h > 0,
      href: "/estudio/control/logs?nivel=security",
    },
    {
      key: "cost",
      label: T.kpi.cost24h,
      value: brl(n.cost24hBrl),
      note: T.kpi.aiFailed24h(n.aiFailed24h, n.aiCalls24h),
      icon: "percent",
    },
  ];
  return (
    <section aria-label={T.overview.kpis} className={className}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => {
          const body = (
            <>
              <span className="flex items-center gap-2 type-meta text-meta">
                <Icon name={t.attention ? "triangle-alert" : t.icon} size={16} />
                {t.label}
              </span>
              <span
                data-kpi={t.key}
                className={cx(
                  "text-24 font-bold tabular-nums leading-tight",
                  t.attention ? "text-warn" : "text-strong",
                )}
              >
                {t.value}
              </span>
              {t.note && <span className="type-meta text-meta">{t.note}</span>}
            </>
          );
          return (
            <li key={t.key}>
              {t.href ? (
                <Link
                  href={t.href}
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
