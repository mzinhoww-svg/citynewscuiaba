import type { Metadata } from "next";
import { AdminNotice, AdsPanel, Button, EmptyState } from "@/components";
import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { canToggleFlags, canWriteSettings } from "@/lib/admin/access";
import { paramsOf, requireArea } from "@/lib/admin/guard";
import { getFlag, listCampaigns, listSections, type CampaignRow } from "@/lib/db/queries/admin";
import { localDateKey } from "@/lib/format/date";
import { createCampaignAction, sponsoredFlagAction, toggleCampaignAction } from "./actions";

export const metadata: Metadata = { title: "Publicidade · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/publicidade";

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireArea("publicidade", NEXT);
  const flash = paramsOf(await searchParams);

  let data: {
    flag: boolean | null;
    campaigns: CampaignRow[];
    sections: { slug: string; name: string }[];
  } | null = null;
  try {
    const [flag, campaigns, sections] = await Promise.all([
      getFlag("sponsored_enabled"),
      listCampaigns(),
      listSections(),
    ]);
    data = { flag, campaigns, sections };
  } catch (e) {
    console.error("estudio publicidade:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.ads.title}</h1>
        <p className="type-body text-meta">{T.ads.intro}</p>
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
        <AdsPanel
          flagEnabled={data.flag}
          campaigns={data.campaigns}
          sections={data.sections}
          today={localDateKey(new Date())}
          canWrite={canWriteSettings(session.roles)}
          canToggleFlag={canToggleFlags(session.roles)}
          createAction={createCampaignAction}
          toggleAction={toggleCampaignAction}
          flagAction={sponsoredFlagAction}
        />
      )}
    </section>
  );
}
