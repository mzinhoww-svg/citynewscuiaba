import type { Metadata } from "next";
import { AdminNotice, Button, EmptyState, SecurityPanel } from "@/components";
import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { isAdminRole } from "@/lib/admin/access";
import { paramsOf, requireArea } from "@/lib/admin/guard";
import { securityOverview } from "@/lib/db/queries/admin";
import { clearLoginBlocksAction } from "./actions";

export const metadata: Metadata = { title: "Segurança · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/seguranca";

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireArea("seguranca", NEXT);
  const flash = paramsOf(await searchParams);

  let data: Awaited<ReturnType<typeof securityOverview>> | null = null;
  try {
    data = await securityOverview();
  } catch (e) {
    console.error("estudio seguranca:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.security.title}</h1>
        <p className="type-body text-meta">{T.security.intro}</p>
      </header>
      <AdminNotice ok={flash.ok} erro={flash.erro} />
      {data === null ? (
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
        <SecurityPanel
          sessions={data.sessions}
          limits={data.limits}
          isAdmin={isAdminRole(session.roles)}
          clearAction={clearLoginBlocksAction}
        />
      )}
    </section>
  );
}
