import type { Metadata } from "next";
import { Button, EmptyState, Pagination } from "@/components";
import {
  CollectionSettingsDialog,
  FastLaneSkippedNotice,
  SourceApprovalsNotice,
  SourceFilters,
  SourcesTable,
  StudioScreen,
} from "@/components/estudio";
import { CONTROL_TEXT } from "@/content/pt-BR/control";
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
    <StudioScreen
      section={CONTROL_TEXT.sectionLabel}
      title={T.title}
      intro={
        sourcesResult.ok ? (
          <>
            <p className="type-body text-meta">
              {T.fastLane(sourcesResult.value.fastLane.used, sourcesResult.value.fastLane.max)}
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 type-meta text-meta">
              {(
                Object.keys(
                  sourcesResult.value.counts,
                ) as (keyof typeof sourcesResult.value.counts)[]
              ).map((s) => (
                <li key={s}>
                  {SOURCE_STATUS_TEXT[s]}:{" "}
                  <span className="font-semibold text-strong">{sourcesResult.value.counts[s]}</span>
                </li>
              ))}
            </ul>
          </>
        ) : undefined
      }
      actions={
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
      }
    >
      <SourceApprovalsNotice count={pendingTotal} href={`${BASE}?pendente=1`} />
      <FastLaneSkippedNotice names={fastSkippedNames} />

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
          <SourcesPagination
            page={filters.page}
            total={sourcesResult.value.total}
            basePath={BASE}
            query={usp}
          />
        </>
      )}
    </StudioScreen>
  );
}

function SourcesPagination({
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
  const hrefFor = (p: number) => {
    const params = new URLSearchParams(query);
    params.set("pagina", String(p));
    return `${basePath}?${params.toString()}`;
  };
  return <Pagination page={page} totalPages={totalPages} hrefFor={hrefFor} label="Paginação" />;
}
