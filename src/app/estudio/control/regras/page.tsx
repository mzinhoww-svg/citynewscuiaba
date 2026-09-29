import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, EmptyState, InlineAlert, RuleMatrix } from "@/components";
import {
  RULES_ADMIN_TEXT as T,
  ruleFieldLabel,
  ruleValueText,
} from "@/content/pt-BR/control-rules";
import { loginRedirect } from "@/lib/auth";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { listRuleVersions, type RuleVersionRow } from "@/lib/db/queries/rules";
import { formatDateTime } from "@/lib/format/date";
import { diffRules, type RuleChange } from "@/lib/rules/critical";
import { resolveRules } from "@/lib/rules/load";
import { proposeRulesAction, simulateRulesAction } from "./actions";
import { RuleProposalForm } from "./RuleProposalForm";

export const metadata: Metadata = { title: "Regras de autonomia · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/regras";
type Params = Record<string, string | string[] | undefined>;

function statusOf(v: RuleVersionRow): string {
  if (v.active) return T.statusActive;
  if (!v.rules) return T.statusInvalid;
  if (v.approvals.some((a) => a.status === "pending")) return T.statusPending;
  if (v.approvedBy) return T.statusRetired;
  if (v.approvals.some((a) => a.status === "rejected")) return T.statusRejected;
  return T.statusDraft;
}

const intParam = (v: string | string[] | undefined): number | null => {
  const s = typeof v === "string" ? v : "";
  return /^[1-9][0-9]{0,9}$/.test(s) ? Number(s) : null;
};

function DiffTable({ changes, caption }: { changes: RuleChange[]; caption: string }) {
  if (changes.length === 0) return <p className="type-body text-meta">{T.changesNone}</p>;
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
    >
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta text-meta">
          <tr>
            <th scope="col" className="px-3 py-3">
              {T.colField}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colBefore}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colAfter}
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.field} className="border-b border-line-subtle last:border-b-0">
              <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                {ruleFieldLabel(c.category, c.key)}
              </th>
              <td className="px-3 py-3 type-body">{ruleValueText(c.key, c.from)}</td>
              <td className="px-3 py-3 type-body">{ruleValueText(c.key, c.to)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function RulesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canAccess(session.roles, "rules.propose")) redirect(loginRedirect(NEXT, "sem-permissao"));
  const sp = await searchParams;
  const proposed = sp.ok === "proposta" ? intParam(sp.versao) : null;
  const compare = intParam(sp.comparar);

  let versions: RuleVersionRow[] | null = null;
  try {
    versions = await listRuleVersions();
  } catch (e) {
    console.error("estudio regras:", e instanceof Error ? e.message : e);
    versions = null;
  }

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="type-screen-title text-strong">{T.title}</h1>
      <p className="type-body text-meta">{T.intro}</p>
    </header>
  );

  if (versions === null) {
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

  const actives = versions.filter((v) => v.active && v.rules);
  const active = actives.length === 1 ? actives[0]! : null;
  const current = active?.rules ?? null;
  const start = current ?? resolveRules({ ok: false, error: "sem versão ativa" }).rules;
  const selected = compare !== null ? versions.find((v) => v.version === compare) : undefined;

  return (
    <section className="flex flex-col gap-8">
      {header}
      {proposed !== null && (
        <InlineAlert
          tone="success"
          role="status"
          action={
            <Button href="/estudio/control/aprovacoes" size="sm" variant="outline">
              {T.goApprovals}
            </Button>
          }
        >
          {T.proposed(proposed)}
        </InlineAlert>
      )}

      <section aria-labelledby="regras-vigor" className="flex flex-col gap-4">
        <h2 id="regras-vigor" className="type-section text-strong">
          {T.currentTitle}
        </h2>
        {active && current ? (
          <>
            <p className="type-body text-body">
              {T.currentLine(active.version, active.approverName, formatDateTime(active.createdAt))}
            </p>
            <p className="type-body font-semibold text-strong">
              {current.forceReview ? T.forceReviewOn : T.forceReviewOff}
            </p>
            <RuleMatrix categories={current.categories} caption={T.matrixCaption(active.version)} />
            <p className="type-meta text-meta">{T.topicsLine(current.sensitiveTopics)}</p>
          </>
        ) : (
          <InlineAlert tone="warn" role="none">
            {T.currentNone}
          </InlineAlert>
        )}
      </section>

      <section aria-labelledby="regras-proposta" className="flex flex-col gap-4">
        <h2 id="regras-proposta" className="type-section text-strong">
          {T.proposalTitle}
        </h2>
        <p className="type-body text-meta">{T.proposalIntro}</p>
        <RuleProposalForm
          current={current}
          start={start}
          simulate={simulateRulesAction}
          propose={proposeRulesAction}
        />
      </section>

      <section aria-labelledby="regras-versoes" className="flex flex-col gap-4">
        <h2 id="regras-versoes" className="type-section text-strong">
          {T.versionsTitle}
        </h2>
        <div
          role="region"
          aria-label={T.versionsCaption}
          tabIndex={0}
          className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
        >
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <caption className="sr-only">{T.versionsCaption}</caption>
            <thead className="border-b border-line-subtle bg-section type-meta text-meta">
              <tr>
                <th scope="col" className="px-3 py-3">
                  {T.colVersion}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.colStatus}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.colProposer}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.colApprover}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.colCreated}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.colCompare}
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.version} className="border-b border-line-subtle last:border-b-0">
                  <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                    {v.version}
                  </th>
                  <td className="px-3 py-3 type-body">{statusOf(v)}</td>
                  <td className="px-3 py-3 type-body">{v.proposerName ?? T.unknownPerson}</td>
                  <td className="px-3 py-3 type-body">
                    {v.approvedBy ? (v.approverName ?? T.unknownPerson) : T.nobody}
                  </td>
                  <td className="px-3 py-3 type-body tabular-nums">
                    {formatDateTime(v.createdAt)}
                  </td>
                  <td className="px-3 py-3 type-body">
                    {active && v.rules && !v.active ? (
                      <a
                        href={`${NEXT}?comparar=${v.version}#regras-comparacao`}
                        aria-label={T.compareLink(v.version)}
                        className="text-link underline underline-offset-2"
                      >
                        {T.compareShort}
                      </a>
                    ) : (
                      T.nobody
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected?.rules && active && current && (
          <section aria-labelledby="regras-comparacao" className="flex flex-col gap-3">
            <h3 id="regras-comparacao" className="type-label text-16 text-strong">
              {T.compareTitle(selected.version, active.version)}
            </h3>
            <DiffTable
              changes={diffRules(current, selected.rules)}
              caption={T.compareTitle(selected.version, active.version)}
            />
          </section>
        )}
      </section>
    </section>
  );
}
