import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SourceConfigForm, SourceLogoForm } from "@/components";
import { DETAIL_TEXT as T, LOGO_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { createServerClient } from "@/lib/db/client";
import { many } from "@/lib/db/queries/run";
import { updateSourceAction, uploadLogoAction } from "../../actions";
import { loadSource, logoUrlOf } from "../detail";

export const metadata: Metadata = {
  title: "Configuração da fonte · Control Center · CityNews Cuiabá",
};

type Props = { params: Promise<{ id: string }> };

/** Aba Configuração (spec §7.2): formulário completo + logotipo. */
export default async function SourceConfigPage({ params }: Props) {
  const { id } = await params;
  const detail = await loadSource(id);
  if (!detail.ok) throw new Error(detail.error.kind);
  const d = detail.value;
  if (!d) notFound();
  const db = await createServerClient();
  const [sections, owner] = await Promise.all([
    db.from("sections").select("slug, name").order("name").then(many),
    d.ownerId
      ? db.from("profiles").select("display_name").eq("id", d.ownerId).maybeSingle()
      : Promise.resolve(null),
  ]);
  const crawlDelay = (d.consumption.robots as { crawlDelaySec?: unknown } | undefined)
    ?.crawlDelaySec;
  const archived = d.archivedAt !== null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="sr-only">{T.sections.config}</h2>
      <section
        aria-labelledby="logo-titulo"
        className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4 sm:p-5"
      >
        <h2 id="logo-titulo" className="type-section text-strong">
          {LOGO_TEXT.title}
        </h2>
        <SourceLogoForm
          source={{
            id: d.id,
            version: d.version,
            name: d.config.displayName ?? d.config.name,
            logoUrl: logoUrlOf(d.logoPath),
            archived,
          }}
          action={uploadLogoAction}
        />
      </section>
      <SourceConfigForm
        source={{
          id: d.id,
          version: d.version,
          config: d.config,
          status: d.status,
          archived,
          lastFetchedAt: d.lastFetchedAt,
          crawlDelaySec: typeof crawlDelay === "number" ? crawlDelay : null,
          termsReviewedAt: d.termsReviewedAt,
          ownerName: owner?.data?.display_name ?? null,
        }}
        defaultFrequency={d.defaultFrequency}
        fastLane={d.fastLane}
        sections={sections}
        action={updateSourceAction}
      />
    </section>
  );
}
