import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, CostPanel, EmptyState } from "@/components";
import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { canReadAiOps } from "@/lib/ai/access";
import { loginRedirect } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { getCosts } from "@/lib/db/queries/ai-control";

export const metadata: Metadata = { title: "Custos e limites · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/custos";

export default async function CostsPage() {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canReadAiOps(session.roles)) redirect(loginRedirect(NEXT, "sem-permissao"));

  let data: Awaited<ReturnType<typeof getCosts>> | null = null;
  try {
    data = await getCosts();
  } catch (e) {
    console.error("estudio custos:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.costsTitle}</h1>
        <p className="type-body text-meta">{T.costsIntro}</p>
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
        <CostPanel summary={data.summary} days={data.days} />
      )}
    </section>
  );
}
