import { Button, EmptyState, SourceAuditTable } from "@/components";
import { DETAIL, HISTORY } from "@/content/pt-BR/sources-admin-detail";
import { HISTORY_PAGE_SIZE, sourceHistory } from "@/lib/db/queries/sources-admin";
import { NEXT } from "../data";

export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { id } = await params;
  const n = Number((await searchParams).pagina);
  const page = Number.isInteger(n) && n >= 1 ? n : 1;
  const res = await sourceHistory(id, page);
  if (!res.ok)
    return (
      <EmptyState
        tone="error"
        title={DETAIL.errorTitle}
        actions={
          <Button size="md" variant="outline" href={`${NEXT}/${id}/historico`}>
            {DETAIL.retry}
          </Button>
        }
      >
        {DETAIL.sectionError}
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-4">
      <h2 className="type-section text-strong">{HISTORY.title}</h2>
      <p className="type-body text-meta">{HISTORY.intro}</p>
      <SourceAuditTable
        rows={res.value.rows}
        page={page}
        total={res.value.total}
        pageSize={HISTORY_PAGE_SIZE}
        basePath={`${NEXT}/${id}/historico`}
      />
    </div>
  );
}
