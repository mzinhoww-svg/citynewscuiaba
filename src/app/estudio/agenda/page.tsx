import type { Metadata } from "next";
import {
  Button,
  CollapsibleFilters,
  DateField,
  EmptyState,
  InlineAlert,
  Pagination,
  Select,
  TextField,
} from "@/components";
import { EventsTable, StudioScreen } from "@/components/estudio";
import { STUDIO_AGENDA_TEXT as T } from "@/content/pt-BR/studio-agenda";
import { requireRole } from "@/lib/auth/require-role";
import {
  listEventSourceOptions,
  listStudioEvents,
  ORIGIN_PARAM,
  parseStudioEventFilters,
  STUDIO_EVENT_ORIGINS,
  STUDIO_EVENT_SITUATIONS,
  STUDIO_EVENTS_PAGE_SIZE,
  type StudioEventFilters,
  type StudioEventRow,
} from "@/lib/db/queries/studio-events";
import { AgendaTabs } from "./AgendaTabs";
import { restoreEventAction, withdrawEventAction } from "./actions";

export const metadata: Metadata = { title: T.metaTitle };
export const dynamic = "force-dynamic";

const BASE = "/estudio/agenda";
const FILTER_KEYS = ["q", "de", "ate", "fonte", "origem", "situacao"] as const;

type Params = Record<string, string | string[] | undefined>;

function toSearchParams(sp: Params): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const one = Array.isArray(v) ? v[0] : v;
    if (typeof one === "string") out.set(k, one);
  }
  return out;
}

function activeCount(f: StudioEventFilters): number {
  return [f.q, f.from, f.to, f.source, f.origin, f.situacao].filter(Boolean).length;
}

/** Eventos da Agenda no Estúdio (AGM-T7, spec 2026-10-08 §5.2): lista, filtros e ações. */
export default async function AgendaEventsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requireRole("article.publish", { section: "agenda" }, { next: BASE });
  const usp = toSearchParams(await searchParams);
  const filters = parseStudioEventFilters(usp);
  const done = T.done[usp.get("feito") ?? ""];
  const failed = usp.get("erro") === "1";

  let result: { rows: StudioEventRow[]; total: number } | null = null;
  let sources: { slug: string; name: string }[] = [];
  try {
    [result, sources] = await Promise.all([listStudioEvents(filters), listEventSourceOptions()]);
  } catch {
    result = null;
  }
  const filtered = activeCount(filters) > 0;
  const totalPages = result ? Math.max(1, Math.ceil(result.total / STUDIO_EVENTS_PAGE_SIZE)) : 1;
  const hrefFor = (page: number) => {
    const params = new URLSearchParams();
    for (const k of FILTER_KEYS) {
      const v = usp.get(k);
      if (v) params.set(k, v);
    }
    params.set("pagina", String(page));
    return `${BASE}?${params.toString()}`;
  };

  return (
    <StudioScreen
      title={T.title}
      intro={<p className="type-body text-meta">{T.intro}</p>}
      actions={
        <Button href={`${BASE}/novo`} size="md" icon="plus">
          {T.add}
        </Button>
      }
    >
      <AgendaTabs current="events" />
      {done && (
        <InlineAlert tone="success" role="status">
          {done}
        </InlineAlert>
      )}
      {failed && (
        <InlineAlert tone="error" role="alert">
          {T.actionFailed}
        </InlineAlert>
      )}

      <CollapsibleFilters
        activeCount={activeCount(filters)}
        clearHref={BASE}
        clearLabel={T.filters.clear}
        className="rounded-lg border border-line-section bg-card-white px-4 py-2"
        bodyClassName="pb-2"
      >
        <form method="get" action={BASE} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField
              id="agenda-busca"
              name="q"
              label={T.filters.search}
              icon="search"
              placeholder={T.filters.searchPlaceholder}
              defaultValue={filters.q ?? ""}
            />
            <DateField
              id="agenda-de"
              name="de"
              label={T.filters.from}
              defaultValue={filters.from ?? ""}
            />
            <DateField
              id="agenda-ate"
              name="ate"
              label={T.filters.to}
              defaultValue={filters.to ?? ""}
            />
            <Select
              id="agenda-fonte"
              name="fonte"
              label={T.filters.source}
              placeholder={T.filters.sourceAll}
              defaultValue={filters.source ?? ""}
              options={sources.map((s) => ({ value: s.slug, label: s.name }))}
            />
            <Select
              id="agenda-origem"
              name="origem"
              label={T.filters.origin}
              placeholder={T.filters.originAll}
              defaultValue={filters.origin ? ORIGIN_PARAM[filters.origin] : ""}
              options={STUDIO_EVENT_ORIGINS.map((o) => ({
                value: ORIGIN_PARAM[o],
                label: T.origin[o] ?? o,
              }))}
            />
            <Select
              id="agenda-situacao"
              name="situacao"
              label={T.filters.situation}
              placeholder={T.filters.situationAll}
              defaultValue={filters.situacao ?? ""}
              options={STUDIO_EVENT_SITUATIONS.map((s) => ({ value: s, label: T.situation[s] }))}
            />
          </div>
          <div>
            <Button type="submit" size="sm" variant="secondary">
              {T.filters.submit}
            </Button>
          </div>
        </form>
      </CollapsibleFilters>

      {result === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          as="h2"
          title={T.error.title}
          actions={
            <Button href={BASE} size="md" variant="outline" icon="refresh-cw">
              {T.error.retry}
            </Button>
          }
        >
          {T.error.body}
        </EmptyState>
      ) : result.rows.length === 0 ? (
        <EmptyState
          as="h2"
          icon="calendar"
          title={filtered ? T.empty.filteredTitle : T.empty.noneTitle}
          actions={
            filtered ? (
              <Button href={BASE} size="md" variant="outline">
                {T.filters.clear}
              </Button>
            ) : (
              <Button href={`${BASE}/novo`} size="md" icon="plus">
                {T.add}
              </Button>
            )
          }
        >
          {filtered ? T.empty.filteredBody : T.empty.noneBody}
        </EmptyState>
      ) : (
        <>
          <p className="type-meta text-meta" role="status">
            {T.total(result.total)}
          </p>
          <EventsTable
            rows={result.rows}
            hrefFor={(id) => `${BASE}/${id}`}
            withdraw={withdrawEventAction}
            restore={restoreEventAction}
          />
          {totalPages > 1 && (
            <Pagination
              page={filters.page}
              totalPages={totalPages}
              hrefFor={hrefFor}
              label={T.pagination}
            />
          )}
        </>
      )}
    </StudioScreen>
  );
}
