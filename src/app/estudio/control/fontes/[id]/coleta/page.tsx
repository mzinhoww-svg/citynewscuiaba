import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Panel } from "@/components";
import {
  AgendaRunsTable,
  CollectionActions,
  EventCollectionActions,
  SourceRunsTable,
} from "@/components/estudio";
import { EVENT_ACTION_TEXT, EVENT_TABS_TEXT as EV } from "@/content/pt-BR/sources-admin-events";
import { EVENT_ORIGIN_TEXT, EXTRACT_KIND_TEXT } from "@/content/pt-BR/studio-agenda";
import { agendaSourceRuns } from "@/lib/db/queries/agenda-runs";
import { formatMinutes, fullDateTime } from "@/content/pt-BR/sources-admin";
import {
  COLLECTION_TAB_TEXT as T,
  DETAIL_TEXT,
  FREQUENCY_FIELD_TEXT,
  STRATEGY_TEXT,
} from "@/content/pt-BR/sources-admin-detail";
import { sourceRuns } from "@/lib/db/queries/sources-admin";
import { collectNowAction, testConnectionAction } from "../../actions";
import { BASE, loadSource } from "../detail";

export const metadata: Metadata = { title: "Coleta e teste · Control Center · CityNews Cuiabá" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Aba Coleta e teste (spec §8): estratégia, via, frequência efetiva, ETag/Last-Modified, descoberta, runs. */
export default async function SourceCollectionPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadSource(id);
  if (!detail.ok) throw new Error(detail.error.kind);
  const d = detail.value;
  if (!d) notFound();
  if (d.event) {
    // Fonte de eventos (AGM-T6): leitura, prévia do teste de conexão e execuções da Agenda.
    const agendaRuns = await agendaSourceRuns(d.id);
    const canCollect = d.archivedAt === null && (d.status === "active" || d.status === "degraded");
    return (
      <section className="flex flex-col gap-6">
        <h2 className="sr-only">{DETAIL_TEXT.sections.collection}</h2>
        {sp.cadastro === "eventos" && (
          <p
            role="status"
            className="rounded-lg border border-line-section bg-cerrado-soft px-4 py-3 type-body text-strong"
          >
            {EVENT_ACTION_TEXT.created}
          </p>
        )}
        <Panel aria-labelledby="como-coletamos" className="flex flex-col gap-3 sm:p-5">
          <h2 id="como-coletamos" className="type-section text-strong">
            {EV.collectionTitle}
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="type-meta text-meta">{EV.extractKind}</dt>
              <dd className="type-body font-semibold text-strong">
                {EXTRACT_KIND_TEXT[d.event.extractKind]}
              </dd>
            </div>
            <div>
              <dt className="type-meta text-meta">{EV.origin}</dt>
              <dd className="type-body text-strong">{EVENT_ORIGIN_TEXT[d.event.origin]}</dd>
            </div>
            <div className="min-w-0">
              <dt className="type-meta text-meta">{EV.address}</dt>
              <dd className="type-body break-all text-strong">{d.config.baseUrl}</dd>
            </div>
            <div className="min-w-0">
              <dt className="type-meta text-meta">{EV.listUrls}</dt>
              <dd className="type-body break-all text-strong">
                {d.event.listUrls.length > 0 ? d.event.listUrls.join(", ") : EV.noListUrls}
              </dd>
            </div>
          </dl>
          <p className="type-meta text-meta">{EV.cadence}</p>
          <EventCollectionActions
            sourceId={d.id}
            canCollectNow={canCollect}
            testAction={testConnectionAction}
            collectNowAction={collectNowAction}
          />
        </Panel>
        <Panel aria-labelledby="runs-titulo" className="flex flex-col gap-3 sm:p-5">
          <h2 id="runs-titulo" className="type-section text-strong">
            {EV.runsTitle}
          </h2>
          {agendaRuns.ok ? (
            <AgendaRunsTable runs={agendaRuns.value} />
          ) : (
            <p className="type-body text-meta">{DETAIL_TEXT.error.tab}</p>
          )}
        </Panel>
      </section>
    );
  }
  const runs = await sourceRuns(d.id);
  const discovery = d.consumption.discovery as { at?: string; tried?: number } | undefined;
  const chosen = d.config.frequencyMinutes ?? d.defaultFrequency;
  const conditional =
    d.lastFetchedAt === null
      ? T.conditionalUnknown
      : d.etag || d.lastModified
        ? T.conditionalYes(Boolean(d.etag), Boolean(d.lastModified))
        : T.conditionalNo;
  const canCollectNow = d.archivedAt === null && (d.status === "active" || d.status === "degraded");

  return (
    <section className="flex flex-col gap-6">
      <h2 className="sr-only">{DETAIL_TEXT.sections.collection}</h2>
      <Panel aria-labelledby="como-coletamos" className="flex flex-col gap-3 sm:p-5">
        <h2 id="como-coletamos" className="type-section text-strong">
          {T.strategyTitle}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="type-meta text-meta">{T.strategy}</dt>
            <dd className="type-body font-semibold text-strong">
              {STRATEGY_TEXT[d.config.strategy]}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="type-meta text-meta">{T.address}</dt>
            <dd className="type-body break-all text-strong">
              {d.config.feedUrl ?? d.config.baseUrl}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.lane}</dt>
            <dd className="type-body font-semibold text-strong">
              {d.lane === "fast" ? T.laneFast : T.laneNormal}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.effective}</dt>
            <dd className="type-body text-strong">
              {d.effective.raisedBy
                ? FREQUENCY_FIELD_TEXT.effective(
                    formatMinutes(d.effective.minutes),
                    d.effective.raisedBy,
                  )
                : formatMinutes(chosen)}
            </dd>
          </div>
        </dl>
        <p className="type-body text-strong">
          <span className="type-meta text-meta">{T.conditional}: </span>
          {conditional}
        </p>
        <p className="type-body text-strong">
          <span className="type-meta text-meta">{T.howFound}: </span>
          {discovery?.at
            ? T.howFoundAuto(fullDateTime(discovery.at), discovery.tried ?? 0)
            : T.howFoundNone}
        </p>
        <CollectionActions
          sourceId={d.id}
          canCollectNow={canCollectNow}
          testAction={testConnectionAction}
          collectNowAction={collectNowAction}
          reanalyzeHref={`${BASE}/nova?url=${encodeURIComponent(d.config.baseUrl)}`}
        />
      </Panel>
      <Panel aria-labelledby="runs-titulo" className="flex flex-col gap-3 sm:p-5">
        <h2 id="runs-titulo" className="type-section text-strong">
          {T.runsTitle}
        </h2>
        {runs.ok ? (
          <SourceRunsTable runs={runs.value} />
        ) : (
          <p className="type-body text-meta">{DETAIL_TEXT.error.tab}</p>
        )}
      </Panel>
    </section>
  );
}
