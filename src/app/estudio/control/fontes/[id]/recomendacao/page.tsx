import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourceRecForm } from "@/components/estudio";
import { DETAIL_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { updateSourceAction } from "../../actions";
import { loadSource, logoUrlOf } from "../detail";

export const metadata: Metadata = {
  title: "Recomendação da fonte · Control Center · CityNews Cuiabá",
};

type Props = { params: Promise<{ id: string }> };

/** Aba Recomendação (spec §7.2, §8). */
export default async function SourceRecommendationPage({ params }: Props) {
  const { id } = await params;
  const detail = await loadSource(id);
  if (!detail.ok) throw new Error(detail.error.kind);
  const d = detail.value;
  // Fonte de eventos (AGM-T6) não tem esta aba.
  if (!d || d.event) notFound();
  return (
    <section className="flex flex-col gap-6">
      <h2 className="sr-only">{DETAIL_TEXT.sections.recommendation}</h2>
      <SourceRecForm
        source={{
          id: d.id,
          version: d.version,
          name: d.config.name,
          displayName: d.config.displayName,
          slug: d.slug,
          logoUrl: logoUrlOf(d.logoPath),
          locality: d.config.locality,
          categories: d.config.categories,
          recPinned: d.config.recPinned,
          recLocalHighlight: d.config.recLocalHighlight,
          recExcluded: d.config.recExcluded,
          archived: d.archivedAt !== null,
        }}
        action={updateSourceAction}
      />
    </section>
  );
}
