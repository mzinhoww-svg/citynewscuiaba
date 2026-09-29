import type { Metadata } from "next";
import Link from "next/link";
import {
  ApprovalBanner,
  Button,
  CampaignForm,
  EmptyState,
  ExperimentForm,
  InlineAlert,
  ShareChart,
  WeightSliders,
  WeightsHistory,
  WhyThisDrawer,
} from "@/components";
import {
  AUDIENCE_TEXT,
  DISMISS_TEXT,
  EXPERIMENT_STATUS_TEXT,
  formatInt,
  formatPct,
  formatWeight,
  LIST_TEXT,
  REC_TEXT as T,
} from "@/content/pt-BR/recommendation-admin";
import { REASON_TEXT } from "@/content/pt-BR/recommendations";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { pendingApprovalsFor } from "@/lib/db/queries/approvals";
import { recPanel } from "@/lib/db/queries/recommendation";
import { formatDayMonth } from "@/lib/format/date";
import { loadOrNull } from "../../load-error";
import {
  activateWeightsAction,
  createCampaignAction,
  createExperimentAction,
  explainRecommendationAction,
  proposeWeightsAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Recomendação de fontes · Control Center · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const reasonText = (key: string): string => {
  const r = (REASON_TEXT as Record<string, string | ((t: string) => string)>)[key];
  return typeof r === "function" ? r("editoria") : (r ?? key);
};

/** O17 · Recomendação: métricas, pesos com aprovação dupla, campanhas, testes A/B e "Por que". */
export default async function RecommendationPage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/recomendacao",
  });
  const canManage = canAccess(session.roles, "rec.weights");
  const data = await loadOrNull("rec panel", async () => {
    const [panel, pending] = await Promise.all([recPanel(), pendingApprovalsFor("rec:")]);
    return { panel, pending };
  });

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio/control/recomendacao" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <Body
          panel={data.value.panel}
          pending={data.value.pending}
          userId={session.userId}
          canManage={canManage}
        />
      )}
    </section>
  );
}

function Body({
  panel,
  pending,
  userId,
  canManage,
}: {
  panel: Awaited<ReturnType<typeof recPanel>>;
  pending: Awaited<ReturnType<typeof pendingApprovalsFor>>;
  userId: string;
  canManage: boolean;
}) {
  const m = panel.metrics;
  const running = panel.experiments.filter((e) => e.status === "running").length;
  const today = new Date().toISOString().slice(0, 10);
  const returns = panel.return7d.reduce(
    (acc, r) => ({ followed: acc.followed + r.followed, returned: acc.returned + r.returned }),
    { followed: 0, returned: 0 },
  );
  const kpis: [string, string, string?][] = [
    [T.kpi.version, panel.config.version],
    [T.kpi.ctr, formatPct(m.ctr), T.ctrHint(m.clicks, m.impressions)],
    [T.kpi.hideRate, formatPct(m.hideRate)],
    [T.kpi.diversity, formatWeight(m.diversity)],
    [T.kpi.top3, formatPct(m.concentrationTop3)],
    [T.kpi.personalization, formatPct(m.personalizationShare)],
    [T.kpi.audience, `${formatInt(m.anonymous)} × ${formatInt(m.accounts)}`],
    [T.kpi.experiments, String(running)],
  ];
  const approvedVersions = panel.weights.filter((w) => w.approvedBy && w.weights);
  return (
    <>
      <ApprovalBanner approvals={pending} currentUserId={userId} />
      {!canManage && <p className="type-meta text-meta">{T.readOnly}</p>}

      <section aria-labelledby="kpis" className="flex flex-col gap-3">
        <h2 id="kpis" className="type-section text-strong">
          {T.kpisTitle}
        </h2>
        {m.concentrationAlert && (
          <InlineAlert tone="warn" role="none" title={T.kpi.top3}>
            {T.concentrationAlert}
          </InlineAlert>
        )}
        <dl aria-label={T.kpisTitle} className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map(([k, v, hint]) => (
            <div key={k} className="rounded-lg border border-line-subtle bg-card-white p-3">
              <dt className="type-meta text-meta">{k}</dt>
              <dd className="text-20 font-bold tabular-nums text-strong break-words">{v}</dd>
              {hint && <dd className="type-meta text-meta">{hint}</dd>}
            </div>
          ))}
        </dl>
        <p className="type-body text-body">
          <span className="font-medium text-strong">{T.return7d}:</span>{" "}
          {T.return7dText(returns.returned, returns.followed)}
        </p>
      </section>

      {m.clicks === 0 && m.impressions === 0 ? (
        <p className="rounded-lg border border-line-subtle bg-card-white p-4 type-body text-meta">
          {T.noEvents}
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <section aria-labelledby="listas" className="flex flex-col gap-3">
            <h2 id="listas" className="type-section text-strong">
              {T.listsTitle}
            </h2>
            <ShareChart
              label={T.listsChart}
              rows={m.byList.map((l) => ({
                label: LIST_TEXT[l.list] ?? l.list,
                value: l.clicks,
                detail: `CTR ${formatPct(l.ctr)}`,
              }))}
              summary={
                m.byList[0]
                  ? T.listsSummary(
                      LIST_TEXT[m.byList[0].list] ?? m.byList[0].list,
                      m.byList[0].clicks,
                      formatPct(m.byList[0].ctr),
                    )
                  : T.noEvents
              }
              formatValue={formatInt}
              columns={{ label: "Lista", value: "Cliques" }}
            />
          </section>
          <section aria-labelledby="razoes" className="flex flex-col gap-3">
            <h2 id="razoes" className="type-section text-strong">
              {T.reasonsTitle}
            </h2>
            <div
              role="region"
              aria-label={T.reasonsCaption}
              tabIndex={0}
              className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
            >
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">{T.reasonsCaption}</caption>
                <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                  <tr>
                    <th scope="col" className="px-3 py-3">
                      {T.reasonCol.reason}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right">
                      {T.reasonCol.clicks}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right">
                      {T.reasonCol.share}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {m.byReason.map((r) => (
                    <tr key={r.reason} className="border-b border-line-subtle last:border-0">
                      <th scope="row" className="px-3 py-2 type-body font-normal text-strong">
                        {reasonText(r.reason)}
                      </th>
                      <td className="px-3 py-2 text-right type-body tabular-nums">
                        {formatInt(r.clicks)}
                      </td>
                      <td className="px-3 py-2 text-right type-body tabular-nums">
                        {formatPct(r.share)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="type-label text-16 text-strong">{T.dismissTitle}</h3>
            <div
              role="region"
              aria-label={T.dismissCaption}
              tabIndex={0}
              className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
            >
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">{T.dismissCaption}</caption>
                <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                  <tr>
                    <th scope="col" className="px-3 py-3">
                      {T.dismissCol.reason}
                    </th>
                    <th scope="col" className="px-3 py-3 text-right">
                      {T.dismissCol.count}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {m.byDismissReason.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-3 py-2 type-body text-meta">
                        —
                      </td>
                    </tr>
                  ) : (
                    m.byDismissReason.map((r) => (
                      <tr key={r.reason} className="border-b border-line-subtle last:border-0">
                        <th scope="row" className="px-3 py-2 type-body font-normal text-strong">
                          {DISMISS_TEXT[r.reason] ?? r.reason}
                        </th>
                        <td className="px-3 py-2 text-right type-body tabular-nums">
                          {formatInt(r.count)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <section aria-labelledby="pesos" className="flex flex-col gap-3">
        <h2 id="pesos" className="type-section text-strong">
          {T.weightsTitle}
        </h2>
        <p className="type-body text-meta">{T.weightsIntro}</p>
        {canManage ? (
          <WeightSliders
            current={panel.config.weights}
            version={panel.config.version}
            propose={proposeWeightsAction}
          />
        ) : (
          <p className="type-body text-body">{T.activeWeights(panel.config.version)}</p>
        )}
        <h3 className="type-label text-16 text-strong">{T.historyTitle}</h3>
        <WeightsHistory
          rows={panel.weights}
          currentUserId={userId}
          canApprove={canManage}
          activate={activateWeightsAction}
        />
      </section>

      <section aria-labelledby="campanhas" className="flex flex-col gap-3">
        <h2 id="campanhas" className="type-section text-strong">
          {T.campaignsTitle}
        </h2>
        <p className="type-body text-meta">{T.campaignsIntro}</p>
        {panel.campaigns.length === 0 ? (
          <p className="type-body text-meta">{T.noCampaigns}</p>
        ) : (
          <div
            role="region"
            aria-label={T.campaignsCaption}
            tabIndex={0}
            className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
          >
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <caption className="sr-only">{T.campaignsCaption}</caption>
              <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                <tr>
                  {(
                    ["name", "sources", "period", "quota", "audience", "status", "clicks"] as const
                  ).map((k) => (
                    <th key={k} scope="col" className="px-3 py-3">
                      {T.campaignCol[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {panel.campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-line-subtle last:border-0 align-top">
                    <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                      {c.name}
                    </th>
                    <td className="px-3 py-3 type-meta text-body">
                      {c.sources.map((s) => s.name).join(", ")}
                    </td>
                    <td className="px-3 py-3 type-body whitespace-nowrap">
                      {formatDayMonth(c.startsOn)} – {formatDayMonth(c.endsOn)}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">{c.quota}</td>
                    <td className="px-3 py-3 type-body">
                      {AUDIENCE_TEXT[c.audience] ?? c.audience}
                    </td>
                    <td className="px-3 py-3 type-body">
                      {c.endsOn < today
                        ? T.campaignEnded
                        : c.startsOn > today
                          ? T.campaignScheduled
                          : T.campaignActive}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">{formatInt(c.clicks30d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canManage && (
          <>
            <h3 className="type-label text-16 text-strong">{T.newCampaign}</h3>
            <CampaignForm sources={panel.sources} create={createCampaignAction} />
          </>
        )}
      </section>

      <section aria-labelledby="testes" className="flex flex-col gap-3">
        <h2 id="testes" className="type-section text-strong">
          {T.experimentsTitle}
        </h2>
        <p className="type-body text-meta">{T.experimentsIntro}</p>
        {panel.experiments.length === 0 ? (
          <p className="type-body text-meta">{T.noExperiments}</p>
        ) : (
          <div
            role="region"
            aria-label={T.experimentsCaption}
            tabIndex={0}
            className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
          >
            <table className="w-full min-w-[48rem] border-collapse text-left">
              <caption className="sr-only">{T.experimentsCaption}</caption>
              <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                <tr>
                  {(["name", "variants", "split", "status", "started"] as const).map((k) => (
                    <th key={k} scope="col" className="px-3 py-3">
                      {T.experimentCol[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {panel.experiments.map((e) => (
                  <tr key={e.id} className="border-b border-line-subtle last:border-0">
                    <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                      <Link
                        href={`/estudio/control/recomendacao/testes/${e.id}`}
                        className="text-link underline"
                      >
                        {e.name}
                      </Link>
                    </th>
                    <td className="px-3 py-3 type-meta text-body">
                      {e.variants.map((v) => `${v.name}: ${v.weightsVersion}`).join(" · ")}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {e.split.map((s) => `${s}%`).join(" / ")}
                    </td>
                    <td className="px-3 py-3 type-body">
                      {EXPERIMENT_STATUS_TEXT[e.status] ?? e.status}
                    </td>
                    <td className="px-3 py-3 type-meta text-meta whitespace-nowrap">
                      {formatDayMonth(e.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canManage && (
          <>
            <h3 className="type-label text-16 text-strong">{T.newExperiment}</h3>
            <ExperimentForm
              key={approvedVersions.map((w) => w.version).join(",")}
              versions={approvedVersions.map((w) => ({ version: w.version, active: w.active }))}
              create={createExperimentAction}
            />
          </>
        )}
      </section>

      {canManage && <WhyThisDrawer explain={explainRecommendationAction} />}
    </>
  );
}
