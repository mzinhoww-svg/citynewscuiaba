import { Button, EmptyState, SourceRecForm } from "@/components";
import { DETAIL } from "@/content/pt-BR/sources-admin-detail";
import { uploadLogoAction } from "../../actions";
import { updateRecommendationAction } from "../actions";
import { getDetail, loadRecFlags, logoUrlOf, NEXT } from "../data";

export default async function RecPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await Promise.all([getDetail(id), loadRecFlags(id)]).catch(() => null);
  const s = data && data[0].ok ? data[0].value : null;
  if (data && s && data[1]) {
    const flags = data[1];
    return (
      <SourceRecForm
        id={s.id}
        version={s.version}
        name={s.config.name}
        displayName={s.config.displayName}
        logoUrl={logoUrlOf(s.logoPath)}
        pinned={flags.pinned}
        localHighlight={flags.localHighlight}
        excluded={flags.excluded}
        archived={s.archived}
        action={updateRecommendationAction}
        logoAction={uploadLogoAction}
        weightsHref="/estudio/control/recomendacao"
      />
    );
  }
  {
    return (
      <EmptyState
        tone="error"
        title={DETAIL.errorTitle}
        actions={
          <Button size="md" variant="outline" href={`${NEXT}/${id}/recomendacao`}>
            {DETAIL.retry}
          </Button>
        }
      >
        {DETAIL.sectionError}
      </EmptyState>
    );
  }
}
