import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, Icon } from "@/components";
import { AI_TEXT, agentName } from "@/content/pt-BR/ai-control";
import { formatBrl } from "@/content/pt-BR/control";
import { requireRole } from "@/lib/auth/require-role";
import { EVAL_AGENTS } from "@/lib/ai/eval";
import { governanceOverview } from "@/lib/db/queries/ai-control";
import { formatDateTime } from "@/lib/format/date";
import { loadOrNull } from "../../load-error";

export const metadata: Metadata = { title: "Governança da IA · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const T = AI_TEXT.governance;
const evalAgents = new Set<string>(EVAL_AGENTS);

function Flag({ on, text }: { on: boolean; text: string }) {
  return (
    <li className="flex items-start gap-2 type-body text-body">
      <Icon
        name={on ? "check" : "circle-alert"}
        size={18}
        className={on ? "mt-0.5 shrink-0 text-service" : "mt-0.5 shrink-0 text-warn"}
      />
      {text}
    </li>
  );
}

export default async function GovernancePage() {
  await requireRole("metrics.view", undefined, { next: "/estudio/control/governanca" });
  const data = await loadOrNull("ai governance", () => governanceOverview());

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{AI_TEXT.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
        <nav aria-label={T.title} className="flex flex-wrap gap-4">
          <Link href="/estudio/control/custos" className="type-body text-link underline">
            {T.links.costs}
          </Link>
          <Link href="/estudio/control/avaliacoes" className="type-body text-link underline">
            {T.links.evals}
          </Link>
          <Link href="/estudio/control/conhecimento" className="type-body text-link underline">
            {T.links.knowledge}
          </Link>
        </nav>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={AI_TEXT.errorTitle}
          actions={
            <Button href="/estudio/control/governanca" size="md" variant="outline">
              {AI_TEXT.retry}
            </Button>
          }
        >
          {AI_TEXT.errorBody}
        </EmptyState>
      ) : (
        (() => {
          const g = data.value;
          return (
            <>
              <section aria-labelledby="salvaguardas" className="flex flex-col gap-3">
                <h2 id="salvaguardas" className="type-section text-strong">
                  {T.flagsTitle}
                </h2>
                <ul className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-card-white p-4">
                  <Flag on={g.aiEnabled} text={g.aiEnabled ? T.aiEnabled : T.aiDisabled} />
                  <Flag on text={g.imageReproduction ? T.reproOn : T.reproOff} />
                  <Flag on={g.securityEvents30d === 0} text={T.security(g.securityEvents30d)} />
                  <Flag on={g.pendingApprovals === 0} text={T.approvals(g.pendingApprovals)} />
                </ul>
              </section>

              <section aria-labelledby="regras" className="flex flex-col gap-3">
                <h2 id="regras" className="type-section text-strong">
                  {T.principlesTitle}
                </h2>
                <ol className="flex list-decimal flex-col gap-1 pl-6 type-body text-body">
                  {T.principles.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
              </section>

              <section aria-labelledby="agentes" className="flex flex-col gap-3">
                <h2 id="agentes" className="type-section text-strong">
                  {T.agentsTitle}
                </h2>
                <div
                  role="region"
                  aria-label={T.agentsCaption}
                  tabIndex={0}
                  className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
                >
                  <table className="w-full min-w-[60rem] border-collapse text-left">
                    <caption className="sr-only">{T.agentsCaption}</caption>
                    <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                      <tr>
                        {(
                          ["agent", "fn", "model", "prompt", "budget", "eval", "status"] as const
                        ).map((k) => (
                          <th key={k} scope="col" className="px-3 py-3">
                            {T.agentCol[k]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.agents.map((a) => (
                        <tr
                          key={a.id}
                          className="border-b border-line-subtle align-top last:border-b-0"
                        >
                          <th scope="row" className="px-3 py-2 type-body font-semibold text-strong">
                            {agentName(a.id)}
                          </th>
                          <td className="px-3 py-2 type-meta max-w-xs text-body">{a.fn}</td>
                          <td className="px-3 py-2 type-meta break-all text-body">
                            {a.modelId}
                            {a.fallbackModelId && (
                              <span className="block text-meta">({a.fallbackModelId})</span>
                            )}
                          </td>
                          <td className="px-3 py-2 type-body">
                            {a.promptVersion ? `v${a.promptVersion}` : T.noPrompt}
                            {a.pendingPrompts > 0 && (
                              <span className="block type-meta text-warn">
                                {T.pending(a.pendingPrompts)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 type-body tabular-nums">
                            {formatBrl(a.dailyBudgetBrl)}
                          </td>
                          <td className="px-3 py-2 type-meta">
                            {!evalAgents.has(a.id) ? (
                              <span className="text-meta">{T.evalNone}</span>
                            ) : a.lastEval ? (
                              <span
                                className={
                                  a.lastEval.passed ? "text-service" : "font-semibold text-warn"
                                }
                              >
                                {a.lastEval.passed ? T.evalPassed : T.evalFailed} ·{" "}
                                {formatDateTime(a.lastEval.at)}
                              </span>
                            ) : (
                              <span className="text-meta">{AI_TEXT.evals.noRuns}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 type-body">
                            {a.enabled ? T.enabled : T.disabled}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {g.prompts.length > 0 && (
                <section aria-labelledby="prompts" className="flex flex-col gap-3">
                  <h2 id="prompts" className="type-section text-strong">
                    {T.promptsTitle}
                  </h2>
                  <div
                    role="region"
                    aria-label={T.promptsCaption}
                    tabIndex={0}
                    className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
                  >
                    <table className="w-full min-w-[40rem] border-collapse text-left">
                      <caption className="sr-only">{T.promptsCaption}</caption>
                      <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                        <tr>
                          {(["agent", "version", "status", "approvals", "when"] as const).map(
                            (k) => (
                              <th key={k} scope="col" className="px-3 py-3">
                                {T.promptCol[k]}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {g.prompts.map((p) => (
                          <tr
                            key={`${p.agentId}:${p.version}`}
                            className="border-b border-line-subtle last:border-b-0"
                          >
                            <th scope="row" className="px-3 py-2 type-body font-normal text-strong">
                              {agentName(p.agentId)}
                            </th>
                            <td className="px-3 py-2 type-body">v{p.version}</td>
                            <td className="px-3 py-2 type-body">
                              {T.promptStatus[p.status] ?? p.status}
                            </td>
                            <td className="px-3 py-2 type-body tabular-nums">{p.approvals}</td>
                            <td className="px-3 py-2 type-body tabular-nums">
                              {formatDateTime(p.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          );
        })()
      )}
    </section>
  );
}
