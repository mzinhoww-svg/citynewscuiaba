import type { Metadata } from "next";
import Link from "next/link";
import { Button, EmptyState, Icon } from "@/components";
import {
  CollectionSettingsDialog,
  FastLaneSkippedNotice,
  SourceApprovalsNotice,
  SourceFilters,
  SourcesTable,
} from "@/components/estudio";
import { SOURCES_LIST_TEXT as T, SOURCE_STATUS_TEXT } from "@/content/pt-BR/sources-admin";
import {
  fastLaneSkippedSources,
  listSources,
  parseSourceFilters,
  pendingSourceApprovals,
  SOURCES_PAGE_SIZE,
  type SourceFilters as Filters,
} from "@/lib/db/queries/sources-admin";

export const metadata: Metadata = { title: "Fontes · Control Center · CityNews Cuiabá" };

const BASE = "/estudio/control/fontes";
const FILTER_KEYS = ["q", "status", "camada", "localidade", "editoria", "saude", "via", "pendente"];

type SearchParamsInput = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<SearchParamsInput> };

function toURLSearchParams(sp: SearchParamsInput): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (typeof v === "string") params.set(key, v);
  }
  return params;
}

/** Alguma restrição além da ordenação/página (vazio "sem filtro" × vazio "com filtro"). */
function hasActiveFilters(f: Filters): boolean {
  return Boolean(
    f.q || f.status || f.layer || f.locality || f.category || f.health || f.via || f.pending,
  );
}

function queryOf(usp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of FILTER_KEYS) {
    const v = usp.get(key);
    if (v) out[key] = v;
  }
  return out;
}

export default async function SourcesListPage({ searchParams }: Props) {
  const usp = toURLSearchParams(await searchParams);
  const filters = parseSourceFilters(usp);

  const [sourcesResult, approvalsResult, fastSkippedResult] = await Promise.all([
    listSources(filters),
    pendingSourceApprovals(),
    fastLaneSkippedSources(),
  ]);
  const pendingTotal = approvalsResult.ok ? approvalsResult.value.length : 0;
  const fastSkippedNames = fastSkippedResult.ok ? fastSkippedResult.value.map((s) => s.name) : [];

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="type-screen-title text-strong">{T.title}</h1>
            {sourcesResult.ok && (
              <p className="type-body text-meta">
                {T.fastLane(sourcesResult.value.fastLane.used, sourcesResult.value.fastLane.max)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {sourcesResult.ok && (
              <CollectionSettingsDialog
                defaultFrequency={sourcesResult.value.defaultFrequency}
                fastLane={sourcesResult.value.fastLane}
              />
            )}
            <Button href={`${BASE}/nova`} size="md" icon="plus">
              {T.addSource}
            </Button>
          </div>
        </div>
        {sourcesResult.ok && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 type-meta text-meta">
            {(
              Object.keys(sourcesResult.value.counts) as (keyof typeof sourcesResult.value.counts)[]
            ).map((s) => (
              <li key={s}>
                {SOURCE_STATUS_TEXT[s]}:{" "}
                <span className="font-semibold text-strong">{sourcesResult.value.counts[s]}</span>
              </li>
            ))}
          </ul>
        )}
        <SourceApprovalsNotice count={pendingTotal} href={`${BASE}?pendente=1`} />
        <FastLaneSkippedNotice names={fastSkippedNames} />
      </header>

      <SourceFilters filters={filters} basePath={BASE} />

      {!sourcesResult.ok ? (
        <EmptyState
          tone="error"
          as="h2"
          title={T.error.title}
          actions={<Button href={BASE}>{T.error.retry}</Button>}
        />
      ) : sourcesResult.value.rows.length === 0 ? (
        <EmptyState
          as="h2"
          title={hasActiveFilters(filters) ? T.empty.filteredTitle : T.empty.noneTitle}
          actions={
            hasActiveFilters(filters) ? (
              <Button href={BASE} variant="outline">
                {T.filters.clear}
              </Button>
            ) : (
              <Button href={`${BASE}/nova`}>{T.addSource}</Button>
            )
          }
        />
      ) : (
        <>
          <SourcesTable
            rows={sourcesResult.value.rows}
            sort={filters.sort}
            dir={filters.dir}
            basePath={BASE}
            query={queryOf(usp)}
            defaultFrequencyMinutes={sourcesResult.value.defaultFrequency}
            fastLane={sourcesResult.value.fastLane}
          />
          <Pagination
            page={filters.page}
            total={sourcesResult.value.total}
            basePath={BASE}
            query={usp}
          />
        </>
      )}
    </section>
  );
}

function Pagination({
  page,
  total,
  basePath,
  query,
}: {
  page: number;
  total: number;
  basePath: string;
  query: URLSearchParams;
}) {
  const totalPages = Math.max(1, Math.ceil(total / SOURCES_PAGE_SIZE));
  if (totalPages <= 1) return null;
  const hrefFor = (p: number) => {
    const params = new URLSearchParams(query);
    params.set("pagina", String(p));
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          className="inline-flex items-center gap-1 type-body text-link no-underline hover:underline"
        >
          <Icon name="chevron-left" size={18} />
          {T.pagination.prev}
        </Link>
      ) : (
        <span />
      )}
      <p className="type-meta text-meta">{T.pagination.of(page, totalPages)}</p>
      {page < totalPages ? (
        <Link
          href={hrefFor(page + 1)}
          className="inline-flex items-center gap-1 type-body text-link no-underline hover:underline"
        >
          {T.pagination.next}
          <Icon name="chevron-right" size={18} />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
