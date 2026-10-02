import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { AgentTable } from "@/components/estudio";
import { AGENTS_TEXT as T } from "@/content/pt-BR/ai-prompts";
import { GLOBAL_DAILY_BUDGET_BRL } from "@/lib/ai/registry";
import { requireRole } from "@/lib/auth/require-role";
import { agentsOverview } from "@/lib/db/queries/ai-prompts";
import { loadOrNull } from "../../load-error";
import { updateAgentAction } from "../ai-prompt-actions";

export const metadata: Metadata = { title: "Agentes · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** O10 · Agentes: função, modelo, prompt em produção, orçamento e liga/desliga. */
export default async function AgentsPage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/agentes",
  });
  // Mesmo conjunto de papéis da RLS `ai_agents_manage` (admin, operador_ia).
  const canEdit = session.roles.some((r) => r.role === "admin" || r.role === "operador_ia");
  const data = await loadOrNull("ai agents", () => agentsOverview());

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
        <div className="flex flex-wrap gap-3">
          <Button href="/estudio/control/testes" size="sm" variant="outline-strong" icon="play">
            {T.playground}
          </Button>
          <Button href="/estudio/control/modelos" size="sm" variant="outline" icon="layers">
            Modelos
          </Button>
        </div>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio/control/agentes" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : data.value.agents.length === 0 ? (
        <EmptyState title={T.empty} />
      ) : (
        <>
          {!canEdit && <p className="type-meta text-meta">{T.readOnly}</p>}
          <AgentTable
            agents={data.value.agents}
            models={data.value.models.map((m) => ({ id: m.id, name: m.name, active: m.active }))}
            globalBudgetBrl={GLOBAL_DAILY_BUDGET_BRL}
            {...(canEdit ? { save: updateAgentAction } : {})}
          />
        </>
      )}
    </section>
  );
}
