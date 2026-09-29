import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, PromptVersions, type PromptVersionItem } from "@/components";
import { agentName } from "@/content/pt-BR/ai-control";
import { PROMPTS_TEXT as T } from "@/content/pt-BR/ai-prompts";
import { isAgentId, promptTarget } from "@/lib/ai/prompts";
import { AGENT_IDS } from "@/lib/ai/types";
import { requireRole } from "@/lib/auth/require-role";
import { promptVersions } from "@/lib/db/queries/ai-prompts";
import { studioContext } from "@/lib/studio/context";
import { loadOrNull } from "../../../load-error";
import {
  createPromptVersionAction,
  publishPromptAction,
  requestPromptPublishAction,
  rollbackPromptAction,
} from "../../ai-prompt-actions";

export const metadata: Metadata = { title: "Prompts e versões · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** O12 · Prompts e versões de um agente, com diff, aprovação dupla e rollback. */
export default async function PromptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireRole("metrics.view", undefined, {
    next: `/estudio/control/prompts/${id}`,
  });
  const canWrite = session.roles.some((r) => r.role === "operador_ia");
  const canApprove = session.roles.some((r) => r.role === "admin" || r.role === "editor_chefe");

  if (!isAgentId(id)) {
    return (
      <section className="flex flex-col gap-6">
        <EmptyState as="h1" title={T.unknownAgent}>
          <p>{T.unknownAgentBody}</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-3">
            {AGENT_IDS.map((a) => (
              <li key={a}>
                <Link href={`/estudio/control/prompts/${a}`} className="text-link underline">
                  {agentName(a)}
                </Link>
              </li>
            ))}
          </ul>
        </EmptyState>
      </section>
    );
  }

  const data = await loadOrNull("ai prompts", async () => {
    const { db } = await studioContext();
    const [versions, approvals] = await Promise.all([
      promptVersions(id, db),
      db
        .from("approvals")
        .select("id, target_ref, status, requested_by, created_at")
        .eq("kind", "prompt.publish")
        .like("target_ref", `prompt:${id}:%`)
        .in("status", ["pending", "approved"])
        .order("created_at", { ascending: false }),
    ]);
    if (approvals.error) throw new Error(approvals.error.message);
    const byTarget = new Map<string, { id: string; status: string; requestedBy: string }>();
    for (const a of approvals.data ?? [])
      if (!byTarget.has(a.target_ref))
        byTarget.set(a.target_ref, { id: a.id, status: a.status, requestedBy: a.requested_by });
    const items: PromptVersionItem[] = versions.map((v) => ({
      id: v.id,
      version: v.version,
      status: v.status,
      body: v.body,
      rationale: v.rationale,
      author: v.author,
      approvedBy: v.approvedBy,
      createdAt: v.createdAt,
      approval: byTarget.get(promptTarget(id, v.version)) ?? null,
    }));
    return items;
  });

  const production = data?.value.find((v) => v.status === "production") ?? null;
  const pending = data?.value.filter((v) => v.approval?.status === "pending") ?? [];
  const approved = data?.value.filter((v) => v.approval?.status === "approved") ?? [];

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.title(agentName(id))}</h1>
        <p className="type-body text-meta">{T.intro}</p>
        <div className="flex flex-wrap gap-3">
          <Button href="/estudio/control/agentes" size="sm" variant="outline" icon="arrow-left">
            {T.agentsLink}
          </Button>
          <Button href="/estudio/control/testes" size="sm" variant="outline-strong" icon="play">
            {T.playgroundLink}
          </Button>
          {id === "answer" && (
            <Button
              href="/estudio/control/avaliacoes"
              size="sm"
              variant="outline"
              icon="flask-conical"
            >
              {T.evalLink}
            </Button>
          )}
        </div>
      </header>

      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={`/estudio/control/prompts/${id}`} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <>
          {pending.map((v) => (
            <p
              key={v.id}
              className="rounded-lg border border-warn bg-atencao-soft px-4 py-3 type-body font-medium text-strong"
            >
              {T.pendingBanner(v.version)}
              {v.approval?.requestedBy === session.userId && ` ${T.waitOther}`}
            </p>
          ))}
          {approved.map((v) => (
            <p
              key={v.id}
              className="rounded-lg border border-line-subtle bg-cerrado-soft px-4 py-3 type-body font-medium text-strong"
            >
              {T.approvedBanner(v.version)}
            </p>
          ))}
          <section aria-labelledby="producao" className="flex flex-col gap-3">
            <h2 id="producao" className="type-section text-strong">
              {production ? T.productionTitle(production.version) : T.noProduction}
            </h2>
            {production && (
              <pre className="whitespace-pre-wrap break-words rounded-lg border border-line-subtle bg-card-white p-4 type-body text-strong">
                {production.body}
              </pre>
            )}
          </section>
          {!canWrite && <p className="type-meta text-meta">{T.onlyOperator}</p>}
          <PromptVersions
            agentId={id}
            versions={data.value}
            currentUserId={session.userId}
            canWrite={canWrite}
            canApprove={canApprove}
            request={requestPromptPublishAction}
            publish={publishPromptAction}
            rollback={rollbackPromptAction}
            create={createPromptVersionAction}
          />
        </>
      )}
    </section>
  );
}
