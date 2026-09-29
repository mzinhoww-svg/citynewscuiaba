import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button, EmptyState, SourceHealthPanel, SourceRunsTable } from "@/components";
import { formatMinutes, FREQUENCY_TEXT } from "@/content/pt-BR/sources-admin";
import { COLLECTION_TAB_TEXT, DETAIL_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { sourceHealth, sourceRuns } from "@/lib/db/queries/sources-admin";
import { detailPath, loadSource } from "./detail";

export const metadata: Metadata = { title: "Fonte · Control Center · CityNews Cuiabá" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Resumo e saúde (spec §8, O04 `/`). */
export default async function SourceSummaryPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await loadSource(id);
  if (!detail.ok) throw new Error(detail.error.kind);
  const d = detail.value;
  if (!d) notFound();
  const [health, runs] = await Promise.all([sourceHealth(d.id), sourceRuns(d.id)]);
  const created = typeof sp.cadastro === "string" ? T.created[sp.cadastro] : null;

  const parts = [formatMinutes(d.effective.minutes)];
  if (d.config.frequencyMinutes === null) parts.push(FREQUENCY_TEXT.default);
  if (d.config.frequencyMinutes !== null && d.config.frequencyMinutes < 30)
    parts.push(FREQUENCY_TEXT.fast);
  const frequencyLabel = `${parts.join(FREQUENCY_TEXT.separator)}${d.effective.raisedBy ? ` (${FREQUENCY_TEXT.raisedBy[d.effective.raisedBy]})` : ""}`;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="sr-only">{T.sections.summary}</h2>
      {created && (
        <p
          role="status"
          className="rounded-lg border border-line-section bg-cerrado-soft px-4 py-3 type-body text-strong"
        >
          {created}
        </p>
      )}
      {!health.ok ? (
        <EmptyState
          tone="error"
          title={T.error.tab}
          actions={<Button href={detailPath(d.id)}>{T.error.retry}</Button>}
        />
      ) : (
        <SourceHealthPanel
          health={health.value}
          editorialScore={d.config.editorialScore}
          frequencyLabel={frequencyLabel}
          lastFetchedAt={d.lastFetchedAt}
          nextCollectionAt={d.nextCollectionAt}
          consecutiveFailures={d.consecutiveFailures}
        />
      )}
      <section
        aria-labelledby="ultimas-coletas"
        className="flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4 sm:p-5"
      >
        <h2 id="ultimas-coletas" className="type-section text-strong">
          {COLLECTION_TAB_TEXT.runsTitle}
        </h2>
        {runs.ok ? (
          <SourceRunsTable runs={runs.value.slice(0, 5)} />
        ) : (
          <p className="type-body text-meta">{T.error.tab}</p>
        )}
      </section>
    </section>
  );
}
