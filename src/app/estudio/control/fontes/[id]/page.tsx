import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, EmptyState, Panel } from "@/components";
import { AgendaRunsTable, SourceHealthPanel, SourceRunsTable } from "@/components/estudio";
import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { EVENT_LIST_TEXT, EVENT_TABS_TEXT as EV } from "@/content/pt-BR/sources-admin-events";
import { EVENT_ORIGIN_TEXT, EXTRACT_KIND_TEXT } from "@/content/pt-BR/studio-agenda";
import { agendaSourceRuns } from "@/lib/db/queries/agenda-runs";
import { formatMinutes, FREQUENCY_TEXT } from "@/content/pt-BR/sources-admin";
import { COLLECTION_TAB_TEXT, DETAIL_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { sourceHealth, sourceRuns } from "@/lib/db/queries/sources-admin";
import { detailPath, loadSource } from "./detail";

export const metadata: Metadata = { title: "Fonte · Control Center · CityNews Cuiabá" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Resumo e saúde (spec §8, O04 `/`). */
export default async function SourceSummaryPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadSource(id);
  if (!detail.ok) throw new Error(detail.error.kind);
  const d = detail.value;
  if (!d) notFound();
  const created = typeof sp.cadastro === "string" ? T.created[sp.cadastro] : null;
  if (d.event) {
    // Fonte de eventos (AGM-T6): resumo da coleta da Agenda e as últimas execuções da fonte.
    const runs = await agendaSourceRuns(d.id);
    const items: [string, string][] = [
      [EV.extractKind, EXTRACT_KIND_TEXT[d.event.extractKind]],
      [EV.origin, EVENT_ORIGIN_TEXT[d.event.origin]],
      [EV.confirms, d.event.confirms ? EVENT_LIST_TEXT.yes : EVENT_LIST_TEXT.no],
      [EV.eventsLive, EVENT_LIST_TEXT.eventsLive(d.eventsLive ?? 0)],
      [EV.lastFetched, d.lastFetchedAt ? fullDateTime(d.lastFetchedAt) : EV.never],
    ];
    return (
      <section className="flex flex-col gap-6">
        <h2 className="sr-only">{T.sections.summary}</h2>
        <Panel aria-labelledby="resumo-eventos" className="flex flex-col gap-3 sm:p-5">
          <h2 id="resumo-eventos" className="type-section text-strong">
            {EV.collectionTitle}
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(([label, value]) => (
              <div key={label}>
                <dt className="type-meta text-meta">{label}</dt>
                <dd className="type-body font-semibold text-strong">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="type-meta text-meta">{EV.cadence}</p>
        </Panel>
        <Panel aria-labelledby="ultimas-coletas" className="flex flex-col gap-3 sm:p-5">
          <h2 id="ultimas-coletas" className="type-section text-strong">
            {EV.runsTitle}
          </h2>
          {runs.ok ? (
            <AgendaRunsTable runs={runs.value.slice(0, 5)} />
          ) : (
            <p className="type-body text-meta">{T.error.tab}</p>
          )}
        </Panel>
      </section>
    );
  }
  const [health, runs] = await Promise.all([sourceHealth(d.id), sourceRuns(d.id)]);

  const parts = [formatMinutes(d.effective.minutes)];
  if (d.config.frequencyMinutes === null) parts.push(FREQUENCY_TEXT.default);
  if (d.config.frequencyMinutes !== null && d.config.frequencyMinutes < 30)
    parts.push(FREQUENCY_TEXT.fast);
  const frequencyLabel = `${parts.join(FREQUENCY_TEXT.separator)}${d.effective.raisedBy ? ` (${FREQUENCY_TEXT.raisedBy[d.effective.raisedBy]})` : ""}`;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="sr-only">{T.sections.summary}</h2>
      {created && (
        <p
          role="status"
          className="rounded-lg border border-line-section bg-cerrado-soft px-4 py-3 type-body text-strong"
        >
          {created}
        </p>
      )}
      {!health.ok ? (
        <EmptyState
          tone="error"
          title={T.error.tab}
          actions={<Button href={detailPath(d.id)}>{T.error.retry}</Button>}
        />
      ) : (
        <SourceHealthPanel
          health={health.value}
          editorialScore={d.config.editorialScore}
          frequencyLabel={frequencyLabel}
          lastFetchedAt={d.lastFetchedAt}
          nextCollectionAt={d.nextCollectionAt}
          consecutiveFailures={d.consecutiveFailures}
        />
      )}
      <Panel aria-labelledby="ultimas-coletas" className="flex flex-col gap-3 sm:p-5">
        <h2 id="ultimas-coletas" className="type-section text-strong">
          {COLLECTION_TAB_TEXT.runsTitle}
        </h2>
        {runs.ok ? (
          <SourceRunsTable runs={runs.value.slice(0, 5)} />
        ) : (
          <p className="type-body text-meta">{T.error.tab}</p>
        )}
      </Panel>
    </section>
  );
}
