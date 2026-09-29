import { Button, EmptyState, SourceConfigForm } from "@/components";
import { DETAIL } from "@/content/pt-BR/sources-admin-detail";
import { updateSourceAction } from "../../actions";
import { getDetail, loadFastLane, loadSections, NEXT } from "../data";

export default async function ConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await Promise.all([getDetail(id), loadSections(), loadFastLane()]).catch(() => null);
  const s = data && data[0].ok ? data[0].value : null;
  if (data && s) {
    const [, sections, lane] = data;
    const sel = s.pageSelectors
      ? `${s.pageSelectors.item} | ${s.pageSelectors.link} | ${s.pageSelectors.title}${s.pageSelectors.date ? ` | ${s.pageSelectors.date}` : ""}`
      : null;
    return (
      <SourceConfigForm
        id={s.id}
        version={s.version}
        config={s.config}
        slug={s.slug}
        status={s.status}
        archived={s.archived}
        sections={sections}
        fastLane={lane}
        frequency={s.frequency}
        nextCollectionAt={s.nextCollectionAt}
        termsReviewedAt={s.termsReviewedAt}
        address={{ baseUrl: s.baseUrl, feedUrl: s.feedUrl, kind: s.kind }}
        pageSelectors={sel}
        action={updateSourceAction}
      />
    );
  }
  {
    return (
      <EmptyState
        tone="error"
        title={DETAIL.errorTitle}
        actions={
          <Button size="md" variant="outline" href={`${NEXT}/${id}/configuracao`}>
            {DETAIL.retry}
          </Button>
        }
      >
        {DETAIL.sectionError}
      </EmptyState>
    );
  }
}
