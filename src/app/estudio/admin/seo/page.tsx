import type { Metadata } from "next";
import { AdminNotice, Button, EmptyState, SeoPanel } from "@/components";
import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { canWriteSettings } from "@/lib/admin/access";
import { paramsOf, requireArea } from "@/lib/admin/guard";
import { isSettingKey } from "@/lib/admin/settings";
import { countWithoutDescription, getSettings } from "@/lib/db/queries/admin";
import robots from "@/app/robots";
import { saveSeoAction } from "./actions";

export const metadata: Metadata = { title: "SEO · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/seo";

export default async function SeoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireArea("seo", NEXT);
  const flash = paramsOf(await searchParams);

  let settings: Awaited<ReturnType<typeof getSettings>> | null = null;
  let missing: { missing: number; total: number } | null = null;
  try {
    settings = await getSettings();
    missing = await countWithoutDescription().catch(() => null);
  } catch (e) {
    console.error("estudio seo:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.seo.title}</h1>
        <p className="type-body text-meta">{T.seo.intro}</p>
      </header>
      <AdminNotice
        ok={flash.ok}
        erro={flash.erro}
        campo={flash.campo && isSettingKey(flash.campo) ? flash.campo : undefined}
        campoLabel={
          flash.campo && isSettingKey(flash.campo) ? T.fieldLabels[flash.campo] : undefined
        }
      />
      {settings === null ? (
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
        <SeoPanel
          action={saveSeoAction}
          canWrite={canWriteSettings(session.roles)}
          titleTemplate={settings["seo.title_template"] ?? ""}
          defaultDescription={settings["seo.default_description"] ?? ""}
          robots={robots()}
          missing={missing}
        />
      )}
    </section>
  );
}
