import type { Metadata } from "next";
import { Button, EmptyState, Icon, Panel, Table } from "@/components";
import { ApprovalBanner, RuleMatrix, RuleProposalForm } from "@/components/estudio";
import { RULES_TEXT as T } from "@/content/pt-BR/rules-admin";
import { requireRole } from "@/lib/auth/require-role";
import { pendingApprovalsFor } from "@/lib/db/queries/approvals";
import { rulesOverview, type RuleVersion } from "@/lib/db/queries/rules";
import { formatDateTime } from "@/lib/format/date";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import { ruleDiff } from "@/lib/rules/simulate";
import { loadOrNull } from "../../load-error";
import { proposeRulesAction, simulateRulesAction } from "./actions";

export const metadata: Metadata = {
  title: "Regras de autonomia · Control Center · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const who = (p: { name: string | null } | null) => p?.name ?? "alguém da equipe";

function statusOf(v: RuleVersion): string {
  if (v.rules === null) return T.status.invalid;
  if (v.active) return T.status.active;
  if (v.approvedBy) return T.status.approved;
  return T.status.pending;
}

/** O05 · Regras de autonomia: versão ativa, propostas com diff, proposta nova com simulação. */
export default async function RulesPage() {
  const session = await requireRole("rules.propose", undefined, {
    next: "/estudio/control/regras",
  });
  const data = await loadOrNull("rules", async () => {
    const [overview, pending] = await Promise.all([rulesOverview(), pendingApprovalsFor("rules:")]);
    return { overview, pending };
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
            <Button href="/estudio/control/regras" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <Body overview={data.value.overview} pending={data.value.pending} userId={session.userId} />
      )}
    </section>
  );
}

function Body({
  overview,
  pending,
  userId,
}: {
  overview: Awaited<ReturnType<typeof rulesOverview>>;
  pending: Awaited<ReturnType<typeof pendingApprovalsFor>>;
  userId: string;
}) {
  const active = overview.active;
  const rules = active?.rules ?? { ...DEFAULT_RULES, forceReview: true };
  return (
    <>
      <ApprovalBanner approvals={pending} currentUserId={userId} />

      <section aria-labelledby="ativa" className="flex flex-col gap-3">
        <h2 id="ativa" className="type-section text-strong">
          {active ? T.activeTitle(active.version) : T.noActive}
        </h2>
        <p className="flex items-start gap-2 type-body text-body">
          <Icon
            name={rules.forceReview ? "shield" : "circle-alert"}
            size={18}
            className={
              rules.forceReview ? "mt-0.5 shrink-0 text-service" : "mt-0.5 shrink-0 text-warn"
            }
          />
          {rules.forceReview ? T.forceReviewOn : T.forceReviewOff}
        </p>
        <RuleMatrix rules={rules} caption={T.matrixCaption(active?.version ?? 0)} />
        <p className="type-body text-body">
          <span className="font-medium text-strong">{T.sensitiveLabel}:</span>{" "}
          {rules.sensitiveTopics.join(", ")}
        </p>
      </section>

      {overview.proposals.length > 0 && (
        <section aria-labelledby="propostas" className="flex flex-col gap-3">
          <h2 id="propostas" className="type-section text-strong">
            {T.proposalsTitle}
          </h2>
          <ul className="flex flex-col gap-3">
            {overview.proposals.map((p) => {
              const diff = p.rules ? ruleDiff(rules, p.rules) : [];
              return (
                <li key={p.version}>
                  <Panel as="div" className="flex flex-col gap-2">
                    <p className="type-body font-semibold text-strong">
                      {T.proposalLine(p.version, who(p.proposedBy))} · {formatDateTime(p.createdAt)}
                    </p>
                    <p className="type-meta text-meta">{T.diffTitle(p.version)}</p>
                    {diff.length === 0 ? (
                      <p className="type-body text-meta">{T.noDiff}</p>
                    ) : (
                      <ul className="flex flex-col gap-1 type-body text-body">
                        {diff.map((d) => (
                          <li key={d.path}>
                            {d.path}: {d.from} → {d.to}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Panel>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="propor" className="flex flex-col gap-3">
        <h2 id="propor" className="type-section text-strong">
          {T.form.title}
        </h2>
        <p className="type-body text-meta">{T.form.intro}</p>
        <RuleProposalForm
          current={rules}
          simulate={simulateRulesAction}
          propose={proposeRulesAction}
        />
      </section>

      <section aria-labelledby="historico" className="flex flex-col gap-3">
        <h2 id="historico" className="type-section text-strong">
          {T.versionsTitle}
        </h2>
        <Table
          caption={T.versionsTitle}
          minWidth="md"
          headers={(
            ["version", "status", "forceReview", "proposedBy", "approvedBy", "when"] as const
          ).map((k) => T.col[k])}
        >
          {overview.versions.map((v) => (
            <tr key={v.version} className="border-b border-line-subtle last:border-0">
              <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                v{v.version}
              </th>
              <td className="px-3 py-3 type-body text-body">{statusOf(v)}</td>
              <td className="px-3 py-3 type-body text-body">{v.forceReview ? T.yes : T.no}</td>
              <td className="px-3 py-3 type-body text-body">{who(v.proposedBy)}</td>
              <td className="px-3 py-3 type-body text-body">
                {v.approvedBy ? who(v.approvedBy) : "—"}
              </td>
              <td className="px-3 py-3 type-meta text-meta whitespace-nowrap">
                {formatDateTime(v.createdAt)}
              </td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}
