import { Button, EmptyState, SourceRunsTable } from "@/components";
import { COLLECTION as T, DETAIL, FIELDS, WIZARD } from "@/content/pt-BR/sources-admin-detail";
import { sourceRuns } from "@/lib/db/queries/sources-admin";
import { FrequencyLabel } from "@/components";
import { collectNowAction, testConnectionAction } from "../../actions";
import { getDetail, loadCollectionInfo, NEXT } from "../data";
import { CollectionActions } from "./CollectionActions";

export default async function CollectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, info, runs] = await Promise.all([
    getDetail(id),
    loadCollectionInfo(id).catch(() => null),
    sourceRuns(id, 10),
  ]);
  if (!detail.ok || !detail.value || !runs.ok)
    return (
      <EmptyState
        tone="error"
        title={DETAIL.errorTitle}
        actions={
          <Button size="md" variant="outline" href={`${NEXT}/${id}/coleta`}>
            {DETAIL.retry}
          </Button>
        }
      >
        {DETAIL.sectionError}
      </EmptyState>
    );
  const s = detail.value;
  const running = s.status === "active" || s.status === "degraded";
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="col-atual" className="flex flex-col gap-3">
        <h2 id="col-atual" className="type-section text-strong">
          {T.title}
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line-section bg-card-white p-4">
            <dt className="type-meta text-meta">{T.strategy}</dt>
            <dd className="type-body font-semibold text-strong">
              {s.strategy
                ? (WIZARD.strategyValue[s.strategy] ?? s.strategy)
                : FIELDS.kindValue[s.kind]}
            </dd>
          </div>
          <div className="rounded-lg border border-line-section bg-card-white p-4">
            <dt className="type-meta text-meta">{T.lane}</dt>
            <dd className="type-body font-semibold text-strong">
              {s.frequency.lane === "fast" ? T.laneFast : T.laneNormal}
            </dd>
          </div>
          <div className="rounded-lg border border-line-section bg-card-white p-4">
            <dt className="type-meta text-meta">{T.frequency}</dt>
            <dd>
              <FrequencyLabel
                chosen={s.frequency.chosen}
                effective={s.frequency.effective}
                raisedBy={s.frequency.raisedBy}
                nextAt={s.nextCollectionAt}
                showNext
              />
            </dd>
          </div>
          <div className="rounded-lg border border-line-section bg-card-white p-4">
            <dt className="type-meta text-meta">{T.crawlDelay}</dt>
            <dd className="type-body font-semibold text-strong">
              {T.crawlDelayValue(s.crawlDelaySec)}
            </dd>
          </div>
          <div className="rounded-lg border border-line-section bg-card-white p-4 sm:col-span-2">
            <dt className="type-meta text-meta">{T.address}</dt>
            <dd className="type-body break-all text-strong">{s.feedUrl ?? s.baseUrl}</dd>
          </div>
        </dl>
        {info?.everFetched && (
          <p className="type-meta text-meta">{info.hasValidators ? T.cacheYes : T.cacheNo}</p>
        )}
      </section>
      <section aria-labelledby="col-desc" className="flex flex-col gap-2">
        <h2 id="col-desc" className="type-section text-strong">
          {T.discoveredTitle}
        </h2>
        {info?.discoveredAt ? (
          <p className="type-body text-body">
            {info.discoveredBy === "auto" ? "Descoberta automática" : "Cadastro manual"} de{" "}
            {info.inputUrl ?? s.baseUrl}, {info.tried ?? 0} endereços tentados.
          </p>
        ) : (
          <p className="type-body text-meta">{T.discoveredNone}</p>
        )}
      </section>
      <section aria-labelledby="col-acoes" className="flex flex-col gap-3">
        <h2 id="col-acoes" className="type-section text-strong">
          {T.actionsTitle}
        </h2>
        {s.archived ? null : (
          <CollectionActions
            id={s.id}
            canCollect={running}
            testAction={testConnectionAction}
            collectAction={collectNowAction}
            reanalyzeHref={`${NEXT}/nova?url=${encodeURIComponent(s.baseUrl)}`}
          />
        )}
      </section>
      <section aria-labelledby="col-runs" className="flex flex-col gap-3">
        <h2 id="col-runs" className="type-section text-strong">
          {T.runsTitle}
        </h2>
        <SourceRunsTable rows={runs.value} />
      </section>
    </div>
  );
}
