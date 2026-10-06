import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, InlineAlert, StatGrid, Table } from "@/components";
import {
  ApprovalBanner,
  CampaignForm,
  ExperimentForm,
  ShareChart,
  WeightSliders,
  WeightsHistory,
  WhyThisDrawer,
  StudioScreen,
} from "@/components/estudio";
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

/** O17 · Recomendação: métricas, pesos com aprovação registrada, campanhas, testes A/B e "Por que". */
export default async function RecommendationPage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/recomendacao",
  });
  const canManage = canAccess(session.roles, "rec.weights");
  // Decidir o pedido `rec.weights` é de admin na prática: a RLS `approvals_decide` (admin,
  // editor-chefe) e `rec_weights_activate` (admin, operador_ia) só se cruzam no admin.
  const canApprove = canManage && session.roles.some((r) => r.role === "admin");
  const data = await loadOrNull("rec panel", async () => {
    const [panel, pending] = await Promise.all([recPanel(), pendingApprovalsFor("rec:")]);
    return { panel, pending };
  });

  return (
    <StudioScreen section={T.sectionLabel} title={T.title} intro={T.intro} gap="lg">
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
          canApprove={canApprove}
        />
      )}
    </StudioScreen>
  );
}

function Body({
  panel,
  pending,
  userId,
  canManage,
  canApprove,
}: {
  panel: Awaited<ReturnType<typeof recPanel>>;
  pending: Awaited<ReturnType<typeof pendingApprovalsFor>>;
  userId: string;
  canManage: boolean;
  canApprove: boolean;
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
        <StatGrid
          aria-label={T.kpisTitle}
          columns={4}
          items={kpis.map(([k, v, hint]) => ({ label: k, value: v, hint: hint || undefined }))}
        />
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
            <Table
              caption={T.reasonsCaption}
              headers={[
                T.reasonCol.reason,
                { label: T.reasonCol.clicks, align: "right" },
                { label: T.reasonCol.share, align: "right" },
              ]}
            >
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
            </Table>
            <h3 className="type-label text-strong">{T.dismissTitle}</h3>
            <Table
              caption={T.dismissCaption}
              headers={[T.dismissCol.reason, { label: T.dismissCol.count, align: "right" }]}
            >
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
            </Table>
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
        <h3 className="type-label text-strong">{T.historyTitle}</h3>
        <WeightsHistory
          rows={panel.weights}
          canApprove={canApprove}
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
          <Table
            caption={T.campaignsCaption}
            minWidth="xl"
            headers={(
              ["name", "sources", "period", "quota", "audience", "status", "clicks"] as const
            ).map((k) => T.campaignCol[k])}
          >
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
                <td className="px-3 py-3 type-body">{AUDIENCE_TEXT[c.audience] ?? c.audience}</td>
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
          </Table>
        )}
        {canManage && (
          <>
            <h3 className="type-label text-strong">{T.newCampaign}</h3>
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
          <Table
            caption={T.experimentsCaption}
            minWidth="lg"
            headers={(["name", "variants", "split", "status", "started"] as const).map(
              (k) => T.experimentCol[k],
            )}
          >
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
          </Table>
        )}
        {canManage && (
          <>
            <h3 className="type-label text-strong">{T.newExperiment}</h3>
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
