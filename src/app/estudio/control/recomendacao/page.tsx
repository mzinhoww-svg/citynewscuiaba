import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AbTestCard,
  Button,
  CampaignForm,
  EmptyState,
  EndCampaignButton,
  ExperimentForm,
  InlineAlert,
  ShareBars,
  WeightSliders,
  WhyThisDrawer,
} from "@/components";
import { REC_TEXT as T } from "@/content/pt-BR/control-rec";
import { loginRedirect } from "@/lib/auth";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import {
  getRecPanel,
  listWeightVersionNames,
  type CampaignRow,
  type RecPanel,
  type WeightVersionRow,
} from "@/lib/db/queries/recommendation";
import { formatDate, formatDateTime, localDateKey } from "@/lib/format/date";
import { formatDecimal2, formatInt, formatPercent } from "@/lib/format/number";
import { concentrationAlert, concentrationTop3, diversityIndex } from "@/lib/ranking";
import {
  createCampaignAction,
  createExperimentAction,
  endCampaignAction,
  explainAction,
  proposeWeightsAction,
} from "./actions";

export const metadata: Metadata = { title: "Recomendação · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/recomendacao";

function statusOf(v: WeightVersionRow): string {
  if (v.active) return T.statusActive;
  if (v.pending) return T.statusPending;
  if (v.approvedBy) return T.statusRetired;
  return T.statusDraft;
}

function campaignState(c: CampaignRow, today: string): string {
  if (c.endedAt || c.endsOn < today) return T.campaignEnded;
  return c.startsOn > today ? T.campaignPlanned : T.campaignRunning;
}

const table = "w-full border-collapse text-left";
const thead = "border-b border-line-subtle bg-section type-meta text-meta";
const region = "overflow-x-auto rounded-lg border border-line-subtle bg-card-white";

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-3 py-3">
      {children}
    </th>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line-subtle bg-card-white p-4">
      <dt className="type-meta text-meta">{label}</dt>
      <dd className="type-section tabular-nums text-strong">{value}</dd>
      {note && <dd className="type-meta text-meta">{note}</dd>}
    </div>
  );
}

function CountTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string;
  rows: [string, number][];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="type-label text-16 text-strong">{caption}</h3>
      {rows.length === 0 ? (
        <p className="type-body text-meta">{T.listEmpty}</p>
      ) : (
        <div role="region" aria-label={caption} tabIndex={0} className={region}>
          <table className={table}>
            <caption className="sr-only">{caption}</caption>
            <thead className={thead}>
              <tr>
                <Th>{head}</Th>
                <Th>{T.colQty}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([k, n]) => (
                <tr key={k} className="border-b border-line-subtle last:border-b-0">
                  <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                    {k}
                  </th>
                  <td className="px-3 py-3 type-body tabular-nums">{formatInt(n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function RecommendationPage() {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canAccess(session.roles, "metrics.view")) redirect(loginRedirect(NEXT, "sem-permissao"));
  const canManage = canAccess(session.roles, "rec.weights");

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="type-screen-title text-strong">{T.title}</h1>
      <p className="type-body text-meta">{T.intro}</p>
    </header>
  );

  let panel: RecPanel;
  let versions: string[] = [];
  try {
    [panel, versions] = await Promise.all([getRecPanel(), listWeightVersionNames()]);
  } catch (e) {
    console.error("estudio recomendação:", e instanceof Error ? e.message : e);
    return (
      <section className="flex flex-col gap-6">
        {header}
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      </section>
    );
  }

  const today = localDateKey(new Date());
  const shares = panel.shares.map((s) => s.share);
  const top3 = concentrationTop3(shares);
  const alert = concentrationAlert(shares);
  const idx = diversityIndex(shares);
  const s = panel.stats;
  const running = panel.experiments.filter((e) => e.status === "running").length;
  const basis = panel.sharesBasis === "clicks" ? T.sharesBasisClicks : T.sharesBasisSessions;
  const clicksByList = Object.entries(s.clicks_by_list).sort((a, b) => b[1] - a[1]);
  const dismissByReason = Object.entries(s.dismissals_by_reason).sort((a, b) => b[1] - a[1]);

  return (
    <section className="flex flex-col gap-10">
      {header}

      <section aria-labelledby="rec-painel" className="flex flex-col gap-4">
        <h2 id="rec-painel" className="type-section text-strong">
          {T.panelTitle}
        </h2>
        <p className="type-meta text-meta">{T.panelWindow}</p>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={T.kpiVersion} value={panel.config.version} />
          <Kpi
            label={T.kpiDiversity}
            value={panel.shares.length ? formatDecimal2(idx) : "—"}
            note={T.diversityHelp}
          />
          <Kpi label={T.kpiTop3} value={panel.shares.length ? formatPercent(top3) : "—"} />
          <Kpi label={T.kpiExperiments} value={formatInt(running)} />
          <Kpi
            label={T.kpiPersonalization}
            value={s.events > 0 ? formatPercent(s.personalized / s.events) : "—"}
          />
          <Kpi
            label={T.kpiAccounts}
            value={s.events > 0 ? formatPercent(s.accounts / s.events) : "—"}
          />
          <Kpi label={T.kpiCtr} value={s.viewed > 0 ? formatPercent(s.clicked / s.viewed) : "—"} />
          <Kpi label={T.kpiDismiss} value={formatInt(s.dismissed)} />
        </dl>
        {s.events === 0 && <p className="type-meta text-meta">{T.noEvents}</p>}

        {panel.shares.length > 0 && (
          <InlineAlert
            tone={alert ? "warn" : "info"}
            title={alert ? T.alertTitle : undefined}
            role="status"
          >
            {alert ? T.alertBody(formatPercent(top3)) : T.okBody(formatPercent(top3))}
          </InlineAlert>
        )}

        <h3 className="type-label text-16 text-strong">{T.sharesTitle}</h3>
        {panel.shares.length === 0 ? (
          <p className="type-body text-meta">{T.sharesEmpty}</p>
        ) : (
          <>
            <ShareBars
              items={panel.shares
                .slice(0, 12)
                .map((x) => ({ key: x.slug, label: x.name, share: x.share }))}
              label={T.sharesCaption}
              summary={T.sharesSummary(
                panel.shares[0]!.name,
                panel.shares.length,
                formatDecimal2(idx),
                basis,
              )}
            />
            <div role="region" aria-label={T.sharesCaption} tabIndex={0} className={region}>
              <table className={`${table} min-w-[28rem]`}>
                <caption className="sr-only">{T.sharesCaption}</caption>
                <thead className={thead}>
                  <tr>
                    <Th>{T.colSource}</Th>
                    <Th>{T.colShare}</Th>
                    <Th>{T.colCount}</Th>
                  </tr>
                </thead>
                <tbody>
                  {panel.shares.map((x) => (
                    <tr key={x.slug} className="border-b border-line-subtle last:border-b-0">
                      <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                        {x.name}
                      </th>
                      <td className="px-3 py-3 type-body tabular-nums">{formatPercent(x.share)}</td>
                      <td className="px-3 py-3 type-body tabular-nums">{formatInt(x.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <CountTable caption={T.byListTitle} head={T.colList} rows={clicksByList} />
          <CountTable caption={T.dismissTitle} head={T.colReason} rows={dismissByReason} />
        </div>
      </section>

      <section aria-labelledby="rec-pesos" className="flex flex-col gap-4">
        <h2 id="rec-pesos" className="type-section text-strong">
          {T.weightsTitle}
        </h2>
        <p className="type-body text-meta">{T.weightsIntro}</p>
        <p className="type-body text-body">{T.whyVersion(panel.config.version)}</p>
        <WeightSliders
          current={panel.config.weights}
          cap={panel.config.cap}
          discoveryEvery={panel.config.discoveryEvery}
          canPropose={canManage}
          propose={proposeWeightsAction}
        />
        <Button href="/estudio/control/aprovacoes" size="md" variant="outline">
          {T.goApprovals}
        </Button>

        <h3 className="type-label text-16 text-strong">{T.historyTitle}</h3>
        {panel.history.length === 0 ? (
          <p className="type-body text-meta">{T.noHistory}</p>
        ) : (
          <div role="region" aria-label={T.historyCaption} tabIndex={0} className={region}>
            <table className={`${table} min-w-[48rem]`}>
              <caption className="sr-only">{T.historyCaption}</caption>
              <thead className={thead}>
                <tr>
                  <Th>{T.colVersion}</Th>
                  <Th>{T.colStatus}</Th>
                  <Th>{T.colWeights}</Th>
                  <Th>{T.colProposer}</Th>
                  <Th>{T.colApprover}</Th>
                  <Th>{T.colCreated}</Th>
                </tr>
              </thead>
              <tbody>
                {panel.history.map((v) => (
                  <tr key={v.version} className="border-b border-line-subtle last:border-b-0">
                    <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                      {v.version}
                    </th>
                    <td className="px-3 py-3 type-body">{statusOf(v)}</td>
                    <td className="px-3 py-3 type-meta tabular-nums">
                      {v.weights ? T.compact(v.weights) : "—"}
                    </td>
                    <td className="px-3 py-3 type-body">{v.proposerName ?? T.unknownPerson}</td>
                    <td className="px-3 py-3 type-body">
                      {v.approvedBy ? (v.approverName ?? T.unknownPerson) : T.nobody}
                    </td>
                    <td className="px-3 py-3 type-body tabular-nums">
                      {formatDateTime(v.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <InlineAlert tone="info" title={T.dp3Title} role="none">
          {T.dp3Body}
        </InlineAlert>
      </section>

      <section aria-labelledby="rec-campanhas" className="flex flex-col gap-4">
        <h2 id="rec-campanhas" className="type-section text-strong">
          {T.curationTitle}
        </h2>
        <p className="type-body text-meta">{T.curationIntro}</p>
        {panel.curation.length === 0 ? (
          <p className="type-body text-meta">{T.curationEmpty}</p>
        ) : (
          <div role="region" aria-label={T.curationCaption} tabIndex={0} className={region}>
            <table className={`${table} min-w-[32rem]`}>
              <caption className="sr-only">{T.curationCaption}</caption>
              <thead className={thead}>
                <tr>
                  <Th>{T.colSource}</Th>
                  <Th>{T.colFlags}</Th>
                  <Th>{T.edit}</Th>
                </tr>
              </thead>
              <tbody>
                {panel.curation.map((c) => (
                  <tr key={c.id} className="border-b border-line-subtle last:border-b-0">
                    <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                      {c.name}
                    </th>
                    <td className="px-3 py-3 type-body">
                      {[
                        c.pinned && T.flagPinned,
                        c.excluded && T.flagExcluded,
                        c.localHighlight && T.flagLocal,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                    <td className="px-3 py-3 type-body">
                      <Link
                        href={`/estudio/control/fontes/${c.id}`}
                        aria-label={T.editSource(c.name)}
                        className="text-link underline underline-offset-2"
                      >
                        {T.edit}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="type-label text-16 text-strong">{T.campaignsTitle}</h3>
        <p className="type-meta text-meta">{T.campaignsNote}</p>
        {panel.campaigns.length === 0 ? (
          <p className="type-body text-meta">{T.campaignsEmpty}</p>
        ) : (
          <div role="region" aria-label={T.campaignsCaption} tabIndex={0} className={region}>
            <table className={`${table} min-w-[56rem]`}>
              <caption className="sr-only">{T.campaignsCaption}</caption>
              <thead className={thead}>
                <tr>
                  <Th>{T.colCampaign}</Th>
                  <Th>{T.colSources}</Th>
                  <Th>{T.colPeriod}</Th>
                  <Th>{T.colQuota}</Th>
                  <Th>{T.colAudience}</Th>
                  <Th>{T.colState}</Th>
                  <Th>{T.colResult}</Th>
                  {canManage && <Th>{T.campEnd_}</Th>}
                </tr>
              </thead>
              <tbody>
                {panel.campaigns.map((c) => {
                  const state = campaignState(c, today);
                  return (
                    <tr key={c.id} className="border-b border-line-subtle last:border-b-0">
                      <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                        {c.name}
                      </th>
                      <td className="px-3 py-3 type-body">{c.sourceSlugs.join(", ")}</td>
                      <td className="px-3 py-3 type-body tabular-nums">
                        {T.period(formatDate(c.startsOn), formatDate(c.endsOn))}
                      </td>
                      <td className="px-3 py-3 type-body tabular-nums">
                        {T.quotaText(c.quotaPct)}
                      </td>
                      <td className="px-3 py-3 type-body">{T.audience[c.audience]}</td>
                      <td className="px-3 py-3 type-body">{state}</td>
                      <td className="px-3 py-3 type-body tabular-nums">
                        {T.resultText(c.clicks, c.sessions)}
                      </td>
                      {canManage && (
                        <td className="px-3 py-3 type-body">
                          {state === T.campaignEnded ? (
                            T.nobody
                          ) : (
                            <EndCampaignButton id={c.id} name={c.name} end={endCampaignAction} />
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canManage && <CampaignForm create={createCampaignAction} today={today} />}
      </section>

      <section aria-labelledby="rec-testes" className="flex flex-col gap-4">
        <h2 id="rec-testes" className="type-section text-strong">
          {T.testsTitle}
        </h2>
        <p className="type-body text-meta">{T.testsIntro}</p>
        {panel.experiments.length === 0 ? (
          <p className="type-body text-meta">{T.testsEmpty}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {panel.experiments.map((e) => (
              <li key={e.id}>
                <AbTestCard
                  id={e.id}
                  name={e.name}
                  status={e.status}
                  variants={e.variants}
                  split={e.split}
                  winner={e.winner}
                />
              </li>
            ))}
          </ul>
        )}
        {canManage && <ExperimentForm versions={versions} create={createExperimentAction} />}
      </section>

      <WhyThisDrawer explain={explainAction} />
    </section>
  );
}
