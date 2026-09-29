import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, EmptyState, ModelsTable } from "@/components";
import { AI_ADMIN_TEXT as T } from "@/content/pt-BR/control-ai";
import { loginRedirect } from "@/lib/auth";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { listModels, type ModelRow } from "@/lib/db/queries/ai-admin";

export const metadata: Metadata = { title: "Modelos de IA · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/modelos";

export default async function ModelsPage() {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canAccess(session.roles, "prompt.publish")) redirect(loginRedirect(NEXT, "sem-permissao"));

  let models: ModelRow[] | null = null;
  try {
    models = await listModels();
  } catch (e) {
    console.error("estudio modelos:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.modelsTitle}</h1>
        <p className="type-body text-meta">{T.modelsIntro}</p>
      </header>
      {models === null ? (
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
      ) : models.length === 0 ? (
        <EmptyState title={T.emptyModelsTitle}>{T.emptyModelsBody}</EmptyState>
      ) : (
        <ModelsTable rows={models} />
      )}
    </section>
  );
}
