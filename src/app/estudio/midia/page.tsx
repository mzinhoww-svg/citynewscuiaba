import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { MediaGrid, QueueTabs } from "@/components/estudio";
import { MEDIA_TEXT as T, QUEUE_TEXT } from "@/content/pt-BR/studio";
import { requireRole } from "@/lib/auth/require-role";
import { listMedia, type MediaCardData } from "@/lib/db/queries/studio-media";
import { formatDate, localDateKey } from "@/lib/format/date";
import { labelsFor } from "@/lib/labels";
import { approveImagesAction } from "../actions";

export const metadata: Metadata = { title: "Biblioteca de mídia · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const TABS = ["pending", "approved", "blocked"] as const;
const PARAM = { pending: "pendentes", approved: "aprovadas", blocked: "bloqueadas" } as const;

export default async function MediaLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireRole("media.approve", undefined, { next: "/estudio/midia" });
  const sp = await searchParams;
  const tab = TABS.find((t) => PARAM[t] === sp.estado) ?? "pending";
  let items: MediaCardData[] | null = null;
  try {
    items = await listMedia(tab);
  } catch {
    items = null;
  }
  const today = localDateKey(new Date());

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
        <div>
          <Button href="/estudio/midia/licencas" size="sm" variant="outline" icon="file-check">
            {T.licensesLink}
          </Button>
        </div>
      </header>
      <QueueTabs
        label={T.tabsLabel}
        current={tab}
        items={TABS.map((t) => ({
          key: t,
          label: T.tabs[t],
          href: t === "pending" ? "/estudio/midia" : `/estudio/midia?estado=${PARAM[t]}`,
        }))}
      />
      {items === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={QUEUE_TEXT.errorTitle}
          actions={
            <Button href="/estudio/midia" size="md" variant="outline">
              {QUEUE_TEXT.retry}
            </Button>
          }
        >
          {QUEUE_TEXT.errorBody}
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState title={T.emptyTitle} icon="camera">
          {T.empty[tab]}
        </EmptyState>
      ) : (
        <MediaGrid
          approveMany={tab === "pending" ? approveImagesAction : undefined}
          items={items.map((m) => {
            const label = labelsFor({
              kind: "original",
              hasAiSummary: false,
              publishMode: null,
              image: {
                kind: m.kind,
                credit: m.credit ?? undefined,
                sourceName: m.sourceName ?? undefined,
              },
              sponsored: false,
            }).shown[1]!;
            const expired = m.licenseUntil !== null && m.licenseUntil < today;
            return {
              id: m.id,
              href: `/estudio/midia/${m.id}`,
              previewSrc: `/api/estudio/midia/${m.id}`,
              credit: m.credit ?? m.license,
              label,
              status: T.status[m.status] ?? m.status,
              risk: T.risk[m.risk] ?? m.risk,
              licenseNote: m.licenseUntil
                ? `${T.field.licenseUntil}: ${formatDate(m.licenseUntil)}`
                : null,
              licenseWarn: expired,
            };
          })}
        />
      )}
    </section>
  );
}
