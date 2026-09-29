import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, EmptyState, PlaygroundForm } from "@/components";
import type { PlaygroundAgentOption, PlaygroundModelOption } from "@/components";
import { AI_ADMIN_TEXT as T } from "@/content/pt-BR/control-ai";
import { isPlaygroundAgent } from "@/lib/ai/playground";
import { loginRedirect } from "@/lib/auth";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { listAgents, listModels, listPromptVersions } from "@/lib/db/queries/ai-admin";
import { runPlaygroundAction } from "./actions";

export const metadata: Metadata = { title: "Playground de testes · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/testes";

export default async function PlaygroundPage() {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canAccess(session.roles, "prompt.publish")) redirect(loginRedirect(NEXT, "sem-permissao"));

  let data: { agents: PlaygroundAgentOption[]; models: PlaygroundModelOption[] } | null = null;
  try {
    const [agents, models] = await Promise.all([listAgents(), listModels()]);
    const usable = agents.filter((a) => isPlaygroundAgent(a.id));
    const versions = await Promise.all(usable.map((a) => listPromptVersions(a.id)));
    data = {
      agents: usable.map((a, i) => ({
        id: a.id,
        production: a.promptVersion,
        versions: (versions[i] ?? []).map((v) => ({ version: v.version, status: v.status })),
      })),
      models: models.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name })),
    };
  } catch (e) {
    console.error("estudio testes:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.testsTitle}</h1>
        <p className="type-body text-meta">{T.testsIntro}</p>
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
      ) : data.agents.length === 0 ? (
        <EmptyState title={T.emptyAgentsTitle}>{T.emptyAgentsBody}</EmptyState>
      ) : (
        <PlaygroundForm agents={data.agents} models={data.models} run={runPlaygroundAction} />
      )}
    </section>
  );
}
