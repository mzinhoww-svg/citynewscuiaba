import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AgentsTable, Button, EmptyState, InlineAlert } from "@/components";
import { AI_ADMIN_TEXT as T, agentLabel } from "@/content/pt-BR/control-ai";
import { loginRedirect } from "@/lib/auth";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { listAgents, listModels, type AgentRow } from "@/lib/db/queries/ai-admin";
import { toggleAgentAction } from "./actions";

export const metadata: Metadata = { title: "Agentes de IA · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/agentes";
type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function AgentsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canAccess(session.roles, "prompt.publish")) redirect(loginRedirect(NEXT, "sem-permissao"));
  const sp = await searchParams;
  const changed = one(sp.agente);
  const done =
    one(sp.ok) === "ligado"
      ? T.toggledOn(agentLabel(changed))
      : one(sp.ok) === "desligado"
        ? T.toggledOff(agentLabel(changed))
        : null;
  const denied = one(sp.erro) !== "";
  const canToggle = session.roles.some((r) => r.role === "admin" || r.role === "operador_ia");

  let data: { agents: AgentRow[]; models: Map<string, string> } | null = null;
  try {
    const [agents, models] = await Promise.all([listAgents(), listModels()]);
    data = { agents, models: new Map(models.map((m) => [m.id, m.name])) };
  } catch (e) {
    console.error("estudio agentes:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.agentsTitle}</h1>
        <p className="type-body text-meta">{T.agentsIntro}</p>
      </header>
      {done && (
        <InlineAlert tone="success" role="status">
          {done}
        </InlineAlert>
      )}
      {denied && (
        <InlineAlert tone="error" role="alert">
          {T.toggleDenied}
        </InlineAlert>
      )}
      {!canToggle && <p className="type-meta text-meta">{T.readOnly}</p>}
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
        <AgentsTable
          canToggle={canToggle}
          toggle={toggleAgentAction}
          rows={data.agents.map((a) => ({
            id: a.id,
            function: a.function,
            modelName: data.models.get(a.modelId) ?? a.modelId,
            fallbackName: a.fallbackModelId
              ? (data.models.get(a.fallbackModelId) ?? a.fallbackModelId)
              : null,
            promptVersion: a.promptVersion,
            dailyBudgetBrl: a.dailyBudgetBrl,
            spentTodayBrl: a.spentTodayBrl,
            enabled: a.enabled,
          }))}
        />
      )}
    </section>
  );
}
