import type { Metadata } from "next";
import { Button, EmptyState, Playground, type PlaygroundAgentOption } from "@/components";
import { PLAYGROUND_TEXT as T, PROMPT_STATUS_TEXT } from "@/content/pt-BR/ai-prompts";
import { resolveProviderKind } from "@/lib/ai/registry";
import { AGENT_IDS } from "@/lib/ai/types";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { agentsOverview, evalCaseOptions, promptVersions } from "@/lib/db/queries/ai-prompts";
import { studioContext } from "@/lib/studio/context";
import { loadOrNull } from "../../load-error";
import { playgroundAction } from "../ai-prompt-actions";

export const metadata: Metadata = {
  title: "Playground de testes · Control Center · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

/** O15 · Playground: agente, versão do prompt, modelo, entrada colada ou caso da regressão. */
export default async function PlaygroundPage() {
  const session = await requireRole("metrics.view", undefined, { next: "/estudio/control/testes" });
  const canRun = canAccess(session.roles, "prompt.publish");
  const data = await loadOrNull("ai playground", async () => {
    const { db } = await studioContext();
    const [{ models }, versions, cases] = await Promise.all([
      agentsOverview(db),
      Promise.all(AGENT_IDS.map((a) => promptVersions(a, db))),
      Promise.all(AGENT_IDS.map((a) => evalCaseOptions(a, db))),
    ]);
    const agents: PlaygroundAgentOption[] = AGENT_IDS.map((id, i) => {
      const vs = versions[i] ?? [];
      const production = vs.find((v) => v.status === "production");
      return {
        id,
        versions: vs.map((v) => ({
          version: v.version,
          label:
            v.status === "production"
              ? T.production(v.version)
              : T.version(v.version, PROMPT_STATUS_TEXT[v.status]),
        })),
        defaultVersion: production?.version ?? null,
        cases: cases[i] ?? [],
      };
    });
    return { agents, models: models.map((m) => ({ id: m.id, name: m.name, active: m.active })) };
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
            <Button href="/estudio/control/testes" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : !canRun ? (
        <p className="type-body text-meta">{T.readOnly}</p>
      ) : (
        <Playground
          agents={data.value.agents}
          models={data.value.models}
          providerKind={resolveProviderKind(process.env)}
          run={playgroundAction}
        />
      )}
    </section>
  );
}
