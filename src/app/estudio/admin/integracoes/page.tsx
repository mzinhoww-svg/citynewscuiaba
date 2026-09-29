import type { Metadata } from "next";
import { Button, EmptyState, IntegrationsTable } from "@/components";
import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { integrationStates } from "@/lib/admin/integrations";
import { requireArea } from "@/lib/admin/guard";
import { integrationProbes } from "@/lib/db/queries/admin";

export const metadata: Metadata = { title: "Integrações · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/integracoes";

export default async function IntegrationsPage() {
  await requireArea("integracoes", NEXT);

  let items: ReturnType<typeof integrationStates> | null = null;
  try {
    // Só booleanos e contagens saem do servidor: o `env` nunca é serializado para a tela.
    items = integrationStates(process.env, await integrationProbes());
  } catch (e) {
    console.error("estudio integracoes:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.integrations.title}</h1>
        <p className="type-body text-meta">{T.integrations.intro}</p>
      </header>
      {items === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.common.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.common.retry}
            </Button>
          }
        >
          {T.common.errorBody}
        </EmptyState>
      ) : (
        <IntegrationsTable items={items} />
      )}
    </section>
  );
}
