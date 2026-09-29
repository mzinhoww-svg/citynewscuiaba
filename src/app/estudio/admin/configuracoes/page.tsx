import type { Metadata } from "next";
import {
  AdminBlock,
  AdminNotice,
  AdminSettingsForm,
  AiOpsTable,
  Button,
  EmptyState,
} from "@/components";
import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { canWriteSettings } from "@/lib/admin/access";
import { paramsOf, requireArea } from "@/lib/admin/guard";
import { isSettingKey } from "@/lib/admin/settings";
import { getSettings } from "@/lib/db/queries/admin";
import { saveSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Configurações · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/configuracoes";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireArea("configuracoes", NEXT);
  const flash = paramsOf(await searchParams);

  let settings: Awaited<ReturnType<typeof getSettings>> | null = null;
  try {
    settings = await getSettings();
  } catch (e) {
    console.error("estudio configuracoes:", e instanceof Error ? e.message : e);
  }
  const canWrite = canWriteSettings(session.roles);
  const v = (k: keyof NonNullable<typeof settings>) => settings?.[k] ?? "";

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.settings.title}</h1>
        <p className="type-body text-meta">{T.settings.intro}</p>
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
        <div className="flex flex-col gap-10">
          <AdminBlock
            id="cfg-form"
            title={`${T.settings.contactTitle} e ${T.settings.notifyTitle.toLowerCase()}`}
          >
            <AdminSettingsForm
              id="cfg"
              action={saveSettingsAction}
              canWrite={canWrite}
              fields={[
                { key: "general.contact_email", type: "email", value: v("general.contact_email") },
                { key: "general.tip_email", type: "email", value: v("general.tip_email") },
                {
                  key: "notify.quiet_start",
                  type: "time",
                  hint: T.settings.quietHint,
                  value: v("notify.quiet_start"),
                },
                { key: "notify.quiet_end", type: "time", value: v("notify.quiet_end") },
                {
                  key: "notify.max_push_per_day",
                  type: "number",
                  hint: T.settings.maxPushHint,
                  value: v("notify.max_push_per_day"),
                },
              ]}
            />
          </AdminBlock>
          <AdminBlock id="cfg-fixed" title={T.settings.readonlyTitle}>
            <AiOpsTable
              caption={T.settings.readonlyCaption}
              minWidthClass="min-w-[28rem]"
              columns={[T.settings.colName, T.settings.colValue]}
            >
              {T.settings.fixed.map((f) => (
                <tr key={f.name} className="border-b border-line-subtle align-top last:border-b-0">
                  <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                    {f.name}
                  </th>
                  <td className="px-3 py-3 type-body">{f.value}</td>
                </tr>
              ))}
            </AiOpsTable>
          </AdminBlock>
        </div>
      )}
    </section>
  );
}
