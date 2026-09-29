import { EmptyState, Button, SourceHealthPanel } from "@/components";
import { DETAIL } from "@/content/pt-BR/sources-admin-detail";
import { sourceHealth } from "@/lib/db/queries/sources-admin";
import { localDateKey } from "@/lib/format/date";
import { getDetail, NEXT } from "./data";

export default async function SourceSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, health] = await Promise.all([getDetail(id), sourceHealth(id)]);
  if (!detail.ok || !detail.value || !health.ok)
    return (
      <EmptyState
        tone="error"
        title={DETAIL.errorTitle}
        actions={
          <Button size="md" variant="outline" href={`${NEXT}/${id}`}>
            {DETAIL.retry}
          </Button>
        }
      >
        {DETAIL.sectionError}
      </EmptyState>
    );
  const s = detail.value;
  return (
    <SourceHealthPanel
      health={health.value}
      today={localDateKey(new Date())}
      lastFetchedAt={s.lastFetchedAt}
      nextCollectionAt={s.nextCollectionAt}
      lastError={s.lastError}
      frequency={s.frequency}
    />
  );
}
