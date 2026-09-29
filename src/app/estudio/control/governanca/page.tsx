import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button, EmptyState, GovernancePanel } from "@/components";
import { AI_OPS_TEXT as T } from "@/content/pt-BR/control-ai-ops";
import { canReadAiOps } from "@/lib/ai/access";
import { resolveProviderKind } from "@/lib/ai/registry";
import { loginRedirect } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { getAiFlags } from "@/lib/db/queries/ai-control";

export const metadata: Metadata = { title: "Governança da IA · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/governanca";

export default async function AiGovernancePage() {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canReadAiOps(session.roles)) redirect(loginRedirect(NEXT, "sem-permissao"));

  let flags: Record<string, boolean | null> | null = null;
  try {
    flags = await getAiFlags();
  } catch (e) {
    console.error("estudio governanca:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.govTitle}</h1>
        <p className="type-body text-meta">{T.govIntro}</p>
      </header>
      {flags === null ? (
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
        <GovernancePanel providerFake={resolveProviderKind(process.env) === "fake"} flags={flags} />
      )}
    </section>
  );
}
