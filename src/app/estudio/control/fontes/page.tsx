import type { Metadata } from "next";
import {
  Button,
  CollectionSettingsDialog,
  EmptyState,
  InlineAlert,
  SourceApprovalsNotice,
  SourceFilters,
  SourcesTable,
  sourcesActiveFilterCount,
  sourcesClearedHref,
  sourcesListHref,
} from "@/components";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin-list";
import { createSourceAdminStore } from "@/lib/db/source-admin-store";
import {
  listSources,
  parseSourceFilters,
  pendingSourceApprovals,
  SOURCES_PAGE_SIZE,
} from "@/lib/db/queries/sources-admin";
import { fastLaneSkippedNames } from "@/lib/db/queries/sources-fast-skips";
import { studioContext } from "@/lib/studio/context";

export const metadata: Metadata = { title: T.metaTitle };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

function toSearchParams(sp: Params): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp))
    for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v]) out.append(k, item);
  return out;
}

/**
 * Lista de fontes (O03): cabeçalho com "Nova fonte" e as configurações da coleta, avisos de
 * aprovações pendentes e de fontes puladas por falta de vaga na via rápida, filtros na URL e a
 * tabela ordenável com ações em lote. O acesso (`source.manage`) é conferido pelo layout.
 */
export default async function SourcesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const filters = parseSourceFilters(toSearchParams(await searchParams));
  const { db } = await studioContext();
  const store = createSourceAdminStore(db);
  const [list, approvals, lane, defaultMinutes, skipped] = await Promise.all([
    listSources(filters),
    pendingSourceApprovals(),
    store.fastLane().catch(() => null),
    store.defaultFrequency().catch(() => null),
    fastLaneSkippedNames(),
  ]);

  const pages = list.ok ? Math.max(1, Math.ceil(list.value.total / SOURCES_PAGE_SIZE)) : 1;
  const noRows = list.ok && list.value.rows.length === 0;
  const hasFilters = sourcesActiveFilterCount(filters) > 0 || filters.page > 1;

  const emptyState = hasFilters ? (
    <EmptyState
      title={T.empty.filteredTitle}
      actions={
        <Button href={sourcesClearedHref(filters)} size="md" variant="outline">
          {T.empty.clear}
        </Button>
      }
    >
      {T.empty.filteredBody}
    </EmptyState>
  ) : (
    <EmptyState
      title={T.empty.title}
      actions={
        <Button href="/estudio/control/fontes/nova" size="md" icon="plus">
          {T.newSource}
        </Button>
      }
    >
      {T.empty.body}
    </EmptyState>
  );

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="type-screen-title text-strong">{T.title}</h1>
          <p className="max-w-read type-body text-meta">{T.intro}</p>
          {lane && (
            <p className="type-label text-strong">
              {T.settings.lane(lane.used, lane.max)}
              {list.ok && (
                <span className="ml-3 font-normal text-meta">{T.results(list.value.total)}</span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {lane && defaultMinutes !== null && (
            <CollectionSettingsDialog defaultMinutes={defaultMinutes} fastLane={lane} />
          )}
          <Button href="/estudio/control/fontes/nova" size="md" icon="plus">
            {T.newSource}
          </Button>
        </div>
      </header>

      {approvals.ok && <SourceApprovalsNotice approvals={approvals.value} />}
      {skipped.length > 0 && (
        <InlineAlert tone="warn" role="none" title={T.fastSkipped.title}>
          {T.fastSkipped.body(skipped.join(", "))}
        </InlineAlert>
      )}

      <SourceFilters filters={filters} />

      {!list.ok ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.error.title}
          actions={
            <Button href={sourcesListHref(filters)} size="md" variant="outline" icon="refresh-cw">
              {T.error.retry}
            </Button>
          }
        >
          {T.error.body}
        </EmptyState>
      ) : (
        <>
          <SourcesTable
            rows={list.value.rows}
            filters={filters}
            empty={noRows ? emptyState : undefined}
          />
          {pages > 1 && (
            <nav aria-label={T.pagination.label} className="flex flex-wrap items-center gap-3">
              <Button
                href={sourcesListHref(filters, { page: filters.page - 1 })}
                size="md"
                variant="outline"
                disabled={filters.page <= 1}
              >
                {T.pagination.prev}
              </Button>
              <span className="type-meta text-meta" aria-current="page">
                {T.pagination.of(Math.min(filters.page, pages), pages)}
              </span>
              <Button
                href={sourcesListHref(filters, { page: filters.page + 1 })}
                size="md"
                variant="outline"
                disabled={filters.page >= pages}
              >
                {T.pagination.next}
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
