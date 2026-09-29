import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CollectionActions, SourceRunsTable } from "@/components";
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

type Props = { params: Promise<{ id: string }> };

/** Aba Coleta e teste (spec §8): estratégia, via, frequência efetiva, ETag/Last-Modified, descoberta, runs. */
export default async function SourceCollectionPage({ params }: Props) {
  const { id } = await params;
  const detail = await loadSource(id);
  if (!detail.ok) throw new Error(detail.error.kind);
  const d = detail.value;
  if (!d) notFound();
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
      <section
        aria-labelledby="como-coletamos"
        className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4 sm:p-5"
      >
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
      </section>
      <section
        aria-labelledby="runs-titulo"
        className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4 sm:p-5"
      >
        <h2 id="runs-titulo" className="type-section text-strong">
          {T.runsTitle}
        </h2>
        {runs.ok ? (
          <SourceRunsTable runs={runs.value} />
        ) : (
          <p className="type-body text-meta">{DETAIL_TEXT.error.tab}</p>
        )}
      </section>
    </section>
  );
}
