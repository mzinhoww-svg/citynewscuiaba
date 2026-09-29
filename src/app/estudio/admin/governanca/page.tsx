import type { Metadata } from "next";
import { Button, EditorialGovernance, EmptyState } from "@/components";
import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { requireArea } from "@/lib/admin/guard";
import { governanceNumbers } from "@/lib/db/queries/admin";

export const metadata: Metadata = { title: "Governança editorial · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/governanca";

export default async function GovernancePage() {
  await requireArea("governanca", NEXT);

  let numbers: Awaited<ReturnType<typeof governanceNumbers>> | null = null;
  try {
    numbers = await governanceNumbers();
  } catch (e) {
    console.error("estudio governanca editorial:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.governance.title}</h1>
        <p className="type-body text-meta">{T.governance.intro}</p>
      </header>
      {numbers === null ? (
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
        <EditorialGovernance numbers={numbers} />
      )}
    </section>
  );
}
