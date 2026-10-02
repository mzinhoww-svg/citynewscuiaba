import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { ModelTable } from "@/components/estudio";
import { MODELS_TEXT as T } from "@/content/pt-BR/ai-prompts";
import { requireRole } from "@/lib/auth/require-role";
import { agentsOverview } from "@/lib/db/queries/ai-prompts";
import { loadOrNull } from "../../load-error";
import { updateModelAction } from "../ai-prompt-actions";

export const metadata: Metadata = { title: "Modelos · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** O11 · Modelos: preço, limites, uso e ativação. */
export default async function ModelsPage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/modelos",
  });
  const canEdit = session.roles.some((r) => r.role === "admin" || r.role === "operador_ia");
  const data = await loadOrNull("ai models", () => agentsOverview());

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
            <Button href="/estudio/control/modelos" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : data.value.models.length === 0 ? (
        <EmptyState title={T.empty} />
      ) : (
        <>
          {!canEdit && <p className="type-meta text-meta">{T.readOnly}</p>}
          <ModelTable
            models={data.value.models}
            {...(canEdit ? { toggle: updateModelAction } : {})}
          />
        </>
      )}
    </section>
  );
}
