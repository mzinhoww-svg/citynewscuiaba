import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, InlineAlert } from "@/components";
import { CycleStrip, RunNowForm, SourceHealthTable } from "@/components/estudio";
import { ALERT_TEXT, CONTROL_TEXT as T, RUN_STATE_LABEL, formatBrl } from "@/content/pt-BR/control";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { controlAbilities } from "@/lib/control";
import {
  controlSnapshot,
  openNotifications,
  sourceHealth,
  sourceOptions,
} from "@/lib/db/queries/control";
import { formatDateTime, formatHour } from "@/lib/format/date";
import { loadOrNull } from "../load-error";
import { runNowAction } from "./actions";

export const metadata: Metadata = { title: "Visão geral · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const O = T.overview;

export default async function ControlOverviewPage() {
  const session = await requireRole("metrics.view", undefined, { next: "/estudio/control" });
  const can = controlAbilities(session.roles);
  const data = await loadOrNull("control", async () => {
    const [snapshot, notifications, health, sources] = await Promise.all([
      controlSnapshot({ costs: can.costs }),
      openNotifications(5),
      sourceHealth(),
      can.operate ? sourceOptions() : Promise.resolve([]),
    ]);
    return { snapshot, notifications, health, sources };
  });

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{O.title}</h1>
        <p className="type-body text-meta">{O.intro}</p>
      </header>

      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio/control" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <Overview
          {...data.value}
          can={can}
          manageSources={canAccess(session.roles, "source.manage")}
        />
      )}
    </section>
  );
}

function Overview({
  snapshot: s,
  notifications,
  health,
  sources,
  can,
  manageSources,
}: {
  snapshot: Awaited<ReturnType<typeof controlSnapshot>>;
  notifications: Awaited<ReturnType<typeof openNotifications>>;
  health: Awaited<ReturnType<typeof sourceHealth>>;
  sources: Awaited<ReturnType<typeof sourceOptions>>;
  can: ReturnType<typeof controlAbilities>;
  manageSources: boolean;
}) {
  const stats: { label: string; value: string; detail?: string; attention?: boolean }[] = [
    {
      label: O.lastRun,
      value: s.lastRun ? formatHour(s.lastRun.startedAt) : O.noRun,
      ...(s.lastRun ? { detail: RUN_STATE_LABEL[s.lastRun.state] } : {}),
      attention: s.alerts.some((a) => a.id === "tick_late"),
    },
    { label: O.nextWindow, value: formatHour(s.nextWindowAt) },
    {
      label: O.queue,
      value: String(s.queue.total),
      attention: s.alerts.some((a) => a.id === "queue_backlog"),
    },
    ...(s.quarantineOpen === null
      ? []
      : [
          { label: O.quarantine, value: String(s.quarantineOpen), attention: s.quarantineOpen > 0 },
        ]),
    {
      label: O.errors1h,
      value: String(s.events1h.errors),
      attention: s.alerts.some((a) => a.id === "error_rate"),
    },
    ...(s.spend
      ? [
          {
            label: O.spend,
            value: formatBrl(s.spend.todayBrl),
            detail: O.budgetOf(formatBrl(s.spend.budgetBrl)),
            attention: s.alerts.some((a) => a.id === "budget"),
          },
        ]
      : []),
  ];

  return (
    <>
      <section aria-label={O.kpis}>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {stats.map((st) => (
            <div
              key={st.label}
              className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4"
            >
              <dt className="flex items-center gap-1 type-meta text-meta">{st.label}</dt>
              <dd
                className={
                  st.attention
                    ? "text-28 font-bold leading-tight tabular-nums text-warn"
                    : "text-28 font-bold leading-tight tabular-nums text-strong"
                }
              >
                {st.value}
                {st.attention && <span className="sr-only"> · {O.alertsTitle}</span>}
              </dd>
              {st.detail && <dd className="type-meta text-meta">{st.detail}</dd>}
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="alertas" className="flex flex-col gap-3">
        <h2 id="alertas" className="type-section text-strong">
          {O.alertsTitle}
        </h2>
        {s.alerts.length === 0 ? (
          <InlineAlert tone="success" role="none">
            {O.noAlerts}
          </InlineAlert>
        ) : (
          <InlineAlert tone="warn" role="none">
            <ul className="flex flex-col gap-1">
              {s.alerts.map((a) => (
                <li key={a.id}>{ALERT_TEXT[a.id](a.values)}</li>
              ))}
            </ul>
          </InlineAlert>
        )}
      </section>

      {can.operate && (
        <section aria-labelledby="executar" className="flex flex-col gap-3">
          <h2 id="executar" className="type-section text-strong">
            {O.runNow}
          </h2>
          <RunNowForm
            sources={sources.filter((x) => x.status === "active" || x.status === "degraded")}
            run={runNowAction}
          />
        </section>
      )}

      <section aria-labelledby="ciclos" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ciclos" className="type-section text-strong">
            {O.cyclesTitle}
          </h2>
          <Link
            href="/estudio/control/execucoes"
            className="type-body font-medium text-link underline-offset-4 hover:underline"
          >
            {O.seeAll}
          </Link>
        </div>
        {s.recentRuns.length === 0 ? (
          <p className="type-body text-meta">{T.runs.empty}</p>
        ) : (
          <CycleStrip label={O.cyclesLabel} runs={s.recentRuns} />
        )}
      </section>

      <section aria-labelledby="fontes" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="fontes" className="type-section text-strong">
            {O.sourcesTitle}
          </h2>
          {manageSources && (
            <Link
              href="/estudio/control/fontes"
              className="type-body font-medium text-link underline-offset-4 hover:underline"
            >
              {O.sourcesLink}
            </Link>
          )}
        </div>
        {health.length === 0 ? (
          <p className="type-body text-meta">{T.health.empty}</p>
        ) : (
          <SourceHealthTable rows={health} />
        )}
      </section>

      {notifications.length > 0 && (
        <section aria-labelledby="avisos" className="flex flex-col gap-3">
          <h2 id="avisos" className="type-section text-strong">
            {O.notificationsTitle}
          </h2>
          <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle bg-card-white">
            {notifications.map((n) => (
              <li key={n.id} className="flex flex-col gap-1 px-4 py-3">
                <p className="type-body font-semibold text-strong">{n.title}</p>
                <p className="type-meta text-body">{n.body}</p>
                <p className="type-meta text-meta">
                  <time dateTime={n.createdAt}>{formatDateTime(n.createdAt)}</time>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
