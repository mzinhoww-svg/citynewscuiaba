import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, EmptyState, EvalPanel, EvalRunButton, InlineAlert } from "@/components";
import { AI_ADMIN_TEXT as A, PROMPT_STATUS_LABEL } from "@/content/pt-BR/control-ai";
import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { canReadAiOps } from "@/lib/ai/access";
import { EVAL_AGENT } from "@/lib/ai/eval";
import { EVAL_CASES } from "@/lib/ai/eval-cases";
import { loginRedirect } from "@/lib/auth";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { getAgent, listPromptVersions } from "@/lib/db/queries/ai-admin";
import { listEvalRuns } from "@/lib/db/queries/ai-control";
import { runEvalAction } from "./actions";

export const metadata: Metadata = { title: "Avaliações e regressão · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/avaliacoes";

export default async function EvalPage() {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canReadAiOps(session.roles)) redirect(loginRedirect(NEXT, "sem-permissao"));
  const canRun = canAccess(session.roles, "prompt.publish");

  let data: {
    runs: Awaited<ReturnType<typeof listEvalRuns>>;
    versions: { version: number; status: string }[];
    production: number | null;
  } | null = null;
  try {
    const [runs, versions, agent] = await Promise.all([
      listEvalRuns(),
      listPromptVersions(EVAL_AGENT),
      getAgent(EVAL_AGENT),
    ]);
    data = {
      runs,
      versions: versions.map((v) => ({
        version: v.version,
        status: PROMPT_STATUS_LABEL[v.status] ?? v.status,
      })),
      production: agent?.promptVersion ?? null,
    };
  } catch (e) {
    console.error("estudio avaliacoes:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.evalTitle}</h1>
        <p className="type-body text-meta">{T.evalIntro}</p>
        <p className="type-meta text-meta">{T.evalAgentNote}</p>
      </header>
      {data === null ? (
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
      ) : (
        <>
          <section aria-labelledby="ai-run" className="flex flex-col gap-3">
            <h2 id="ai-run" className="type-section text-strong">
              {T.runTitle}
            </h2>
            {canRun ? (
              data.versions.length === 0 ? (
                <InlineAlert tone="info" role="none">
                  {A.noPromptVersions}
                </InlineAlert>
              ) : (
                <EvalRunButton
                  agentId={EVAL_AGENT}
                  versions={data.versions}
                  initial={data.production}
                  run={runEvalAction}
                />
              )
            ) : (
              <p className="type-body text-meta">{T.runDenied}</p>
            )}
          </section>
          <EvalPanel
            cases={EVAL_CASES.map((c) => ({
              id: c.id,
              question: c.question,
              refuse: c.expect.refuse,
              sources: c.sources.length,
              publishers: new Set(c.sources.map((s) => s.publisher)).size,
            }))}
            runs={data.runs.map((r) => ({
              id: r.id,
              createdAt: r.createdAt,
              promptVersion: r.promptVersion,
              provider: r.provider,
              cases: r.cases,
              metrics: r.metrics,
            }))}
          />
        </>
      )}
    </section>
  );
}
