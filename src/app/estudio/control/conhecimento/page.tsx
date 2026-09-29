import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, EmptyState, KnowledgePanel } from "@/components";
import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { canReadAiOps } from "@/lib/ai/access";
import { loginRedirect } from "@/lib/auth";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { listAgents } from "@/lib/db/queries/ai-admin";
import { getKnowledge } from "@/lib/db/queries/ai-control";

export const metadata: Metadata = { title: "Bases de conhecimento · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/conhecimento";

export default async function KnowledgePage() {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canReadAiOps(session.roles)) redirect(loginRedirect(NEXT, "sem-permissao"));

  let data: {
    knowledge: Awaited<ReturnType<typeof getKnowledge>>;
    agents: Awaited<ReturnType<typeof listAgents>>;
  } | null = null;
  try {
    const [knowledge, agents] = await Promise.all([getKnowledge(), listAgents()]);
    data = { knowledge, agents };
  } catch (e) {
    console.error("estudio conhecimento:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.knowledgeTitle}</h1>
        <p className="type-body text-meta">{T.knowledgeIntro}</p>
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
        <KnowledgePanel
          corpus={data.knowledge.corpus}
          sources={data.knowledge.sources}
          agents={data.agents.map((a) => ({
            id: a.id,
            function: a.function,
            promptVersion: a.promptVersion,
          }))}
          canManageSources={canAccess(session.roles, "source.manage")}
        />
      )}
    </section>
  );
}
