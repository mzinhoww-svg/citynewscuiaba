import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import {
  AgendaCalendar,
  Button,
  Chip,
  EmptyState,
  EventCard,
  FilterBar,
  LoadMore,
  loadMoreAnchor,
  RecurringDates,
  Skeleton,
  cx,
} from "@/components";
import { NEIGHBORHOODS, neighborhoodBySlug } from "@/content/pt-BR/neighborhoods";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import { upcomingRecurring } from "@/lib/agenda/recurring";
import type { EventView } from "@/lib/db/queries";
import {
  listAgendaEvents,
  listAgendaEventsThrough,
  listEventsInRange,
  type EventFilters,
} from "@/lib/db/queries/events";
import { ok } from "@/lib/result";
import {
  AGENDA_CATEGORIES,
  AGENDA_PARAM_VALUES,
  agendaHref,
  agendaRange,
  calendarMonth,
  parseAgendaFilters,
  type AgendaFilters,
  type AgendaOrigin,
  type AgendaWhen,
} from "@/lib/filters/agenda";
import { firstParam, type SearchParamsInput } from "@/lib/filters/section";
import { dayStart, formatLongDate, formatMonthYear, localDateKey } from "@/lib/format/date";

/** Agenda (P09): filtros e visão na URL, renderizada por requisição. */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: AGENDA.metaTitle,
  documentTitle: AGENDA.metaTitle,
  description: AGENDA.metaDescription,
  path: "/agenda",
});

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

type Props = { searchParams: Promise<SearchParamsInput> };

function Hidden({ href }: { href: string }) {
  const params = new URL(href, "http://x").searchParams;
  return (
    <>
      {[...params.entries()].map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

/** Lista/Calendário: cada botão é um formulário GET que preserva os filtros (sem JS também). */
function ViewToggle({ f }: { f: AgendaFilters }) {
  const views = [
    { view: "list" as const, label: AGENDA.list, icon: "list" as const },
    { view: "cal" as const, label: AGENDA.calendar, icon: "calendar-days" as const },
  ];
  return (
    <div
      role="group"
      aria-label={AGENDA.view}
      className="inline-flex gap-0.5 self-start rounded-pill border border-line-control bg-card-white p-0.5"
    >
      {views.map((v) => (
        <Form key={v.view} action="/agenda">
          <Hidden
            href={agendaHref(f, { view: v.view, day: v.view === "cal" ? undefined : f.day })}
          />
          <button
            type="submit"
            aria-pressed={f.view === v.view}
            className={cx(
              "flex min-h-tap cursor-pointer items-center gap-1.5 rounded-pill px-4 text-14 leading-none",
              f.view === v.view
                ? "bg-action-primary font-semibold text-on-inverse"
                : "font-medium text-strong hover:bg-section",
            )}
          >
            {v.label}
          </button>
        </Form>
      ))}
    </div>
  );
}

/** Atalhos de data e preço na URL: tocar de novo no que está ativo desliga o filtro. */
function Shortcuts({ f }: { f: AgendaFilters }) {
  const whenHref = (when: AgendaWhen) =>
    agendaHref(f, {
      view: "list",
      day: undefined,
      month: undefined,
      when: f.when === when && !f.day && f.view === "list" ? "30d" : when,
    });
  const whenActive = (when: AgendaWhen) => f.view === "list" && !f.day && f.when === when;
  return (
    <nav aria-label={AGENDA.shortcuts}>
      <ul className="-mx-gutter flex snap-x scroll-px-gutter gap-2 overflow-x-auto px-gutter py-1 scrollbar-none lg:mx-0 lg:scroll-px-0 lg:px-0">
        {(
          [
            ["today", AGENDA.shortcutToday],
            ["tomorrow", AGENDA.shortcutTomorrow],
            ["weekend", AGENDA.shortcutWeekend],
          ] as const
        ).map(([when, label]) => (
          <li key={when} className="snap-start">
            <Chip href={whenHref(when)} active={whenActive(when)}>
              {label}
            </Chip>
          </li>
        ))}
        <li className="snap-start">
          <Chip href={agendaHref(f, { free: !f.free })} active={f.free}>
            {AGENDA.shortcutFree}
          </Chip>
        </li>
        <li className="snap-start">
          <Chip href={agendaHref(f, { kids: !f.kids })} active={f.kids}>
            {AGENDA.shortcutKids}
          </Chip>
        </li>
      </ul>
    </nav>
  );
}

function Filters({ f }: { f: AgendaFilters }) {
  const active =
    Number(!!f.category) + Number(!!f.neighborhood) + Number(!!f.origin) + Number(f.when !== "30d");
  return (
    <FilterBar
      action="/agenda"
      label={AGENDA.filters}
      formKey={agendaHref(f)}
      hidden={{
        view: f.view === "cal" ? "cal" : undefined,
        mes: f.view === "cal" ? f.month : undefined,
        gratuito: f.free ? "1" : undefined,
        criancas: f.kids ? "1" : undefined,
      }}
      activeCount={active}
      clearHref={agendaHref({
        view: f.view,
        free: f.free,
        kids: f.kids,
        when: "30d",
        month: f.month,
      })}
      clearLabel={AGENDA.clear}
      applyLabel={AGENDA.apply}
      fields={[
        ...(f.view === "list"
          ? [
              {
                name: "quando",
                label: AGENDA.when,
                value: AGENDA_PARAM_VALUES.when[f.when],
                options: (Object.keys(AGENDA.whens) as AgendaWhen[]).map((w) => ({
                  value: AGENDA_PARAM_VALUES.when[w],
                  label: AGENDA.whens[w],
                })),
              },
            ]
          : []),
        {
          name: "categoria",
          label: AGENDA.category,
          value: f.category ?? "",
          placeholder: AGENDA.allCategories,
          options: AGENDA_CATEGORIES.map((c) => ({ value: c, label: AGENDA.categories[c] ?? c })),
        },
        {
          name: "bairro",
          label: AGENDA.neighborhood,
          value: f.neighborhood ?? "",
          placeholder: AGENDA.allNeighborhoods,
          options: NEIGHBORHOODS.map((n) => ({ value: n.slug, label: n.name })),
        },
        {
          name: "origem",
          label: AGENDA.origin,
          value: f.origin ? AGENDA_PARAM_VALUES.origin[f.origin] : "",
          placeholder: AGENDA.allOrigins,
          options: (Object.keys(AGENDA.origins) as AgendaOrigin[]).map((o) => ({
            value: AGENDA_PARAM_VALUES.origin[o],
            label: AGENDA.origins[o],
          })),
        },
      ]}
    />
  );
}

function emptyTitle(f: AgendaFilters): string {
  return AGENDA.emptyTitle({
    free: f.free,
    kids: f.kids,
    category: f.category ? AGENDA.categories[f.category] : undefined,
    where: neighborhoodBySlug(f.neighborhood)?.in,
    period:
      f.view === "cal"
        ? AGENDA.inMonth
        : f.day
          ? AGENDA.onDay(formatLongDate(dayStart(f.day).toISOString()))
          : AGENDA.periodPhrase[f.when],
  });
}

/** Sem filtro do visitante e com menos de 3 eventos próximos: mostra as datas fixas da cidade. */
function recurringFor(f: AgendaFilters, events: readonly EventView[], now: Date) {
  const unfiltered =
    !f.category &&
    !f.neighborhood &&
    !f.origin &&
    !f.free &&
    !f.kids &&
    !f.day &&
    f.when === "30d" &&
    f.view === "list";
  const near = events.filter((e) => Date.parse(e.startsAt) <= now.getTime() + 14 * 86_400_000);
  return unfiltered && near.length < 3 ? upcomingRecurring(now, 6) : [];
}

function eventFilters(f: AgendaFilters, range: { from: string; to: string }): EventFilters {
  return {
    from: range.from,
    to: range.to,
    freeOnly: f.free,
    kidsOnly: f.kids,
    category: f.category,
    neighborhood: f.neighborhood ? neighborhoodBySlug(f.neighborhood)?.name : undefined,
    origin: f.origin,
  };
}

/** Link de "Carregar mais": mesmos filtros, cursor e âncora do primeiro evento novo. */
function moreHref(f: AgendaFilters, cursor: string, shown: number): string {
  const base = agendaHref(f);
  return `${base}${base.includes("?") ? "&" : "?"}cursor=${cursor}#${loadMoreAnchor(shown)}`;
}

/**
 * Lista: página por cursor ("Carregar mais" acumula até o cursor e mais uma página).
 * Calendário: o mês inteiro, em páginas, para a contagem por dia não parar em 100.
 */
async function loadEvents(f: AgendaFilters, cursor: string | undefined, now: Date) {
  const filters = eventFilters(f, agendaRange(f, now));
  if (f.view === "cal") {
    const all = await listEventsInRange(filters);
    return all.ok
      ? ok({ events: all.value, total: all.value.length, nextCursor: null, firstNew: -1 })
      : all;
  }
  const [page, head] = await Promise.all([
    listAgendaEvents(filters, { cursor }),
    cursor ? listAgendaEventsThrough(filters, cursor) : Promise.resolve(ok([] as EventView[])),
  ]);
  if (!page.ok) return page;
  const before = head.ok ? head.value : [];
  return ok({
    events: [...before, ...page.value.rows],
    total: page.value.total,
    nextCursor: page.value.nextCursor,
    firstNew: before.length > 0 && page.value.rows.length > 0 ? before.length : -1,
  });
}

async function Results({ f, cursor }: { f: AgendaFilters; cursor?: string }) {
  const now = new Date();
  const r = await loadEvents(f, cursor, now);
  if (!r.ok) {
    return (
      <EmptyState
        tone="error"
        title={AGENDA.errorTitle}
        actions={
          <Button href={agendaHref(f)} size="md">
            {AGENDA.retry}
          </Button>
        }
      >
        <p>{AGENDA.errorText}</p>
      </EmptyState>
    );
  }
  const { events, total, nextCursor, firstNew } = r.value;
  const firstNewId = firstNew >= 0 ? events[firstNew]?.id : undefined;

  if (f.view === "cal") {
    const month = calendarMonth(f, now);
    const counts = new Map<string, number>();
    for (const e of events) {
      const key = localDateKey(e.startsAt);
      if (key.startsWith(month)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [y, m] = month.split("-").map(Number);
    const prev = m === 1 ? `${(y ?? 0) - 1}-12` : `${y}-${String((m ?? 1) - 1).padStart(2, "0")}`;
    const next = m === 12 ? `${(y ?? 0) + 1}-01` : `${y}-${String((m ?? 1) + 1).padStart(2, "0")}`;
    return (
      <div className="flex flex-col gap-4">
        <AgendaCalendar
          month={month}
          title={formatMonthYear(month)}
          today={localDateKey(now)}
          prevHref={agendaHref(f, { month: prev })}
          nextHref={agendaHref(f, { month: next })}
          days={[...counts.entries()].map(([key, count]) => ({
            key,
            count,
            label: formatLongDate(dayStart(key).toISOString()),
            href: agendaHref(f, { view: "list", day: key, month: undefined }),
          }))}
        />
        {events.length === 0 && <p className="type-body text-meta">{emptyTitle(f)}.</p>}
      </div>
    );
  }

  const recurring = recurringFor(f, events, now);

  if (events.length === 0 && recurring.length > 0) {
    return (
      <div className="flex flex-col gap-6">
        <RecurringDates items={recurring} headingLevel={2} id="agenda-recorrentes" />
        <div>
          <Button href="/agenda/sugerir" size="md" variant="outline">
            {AGENDA.suggest}
          </Button>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    const widen = f.day || f.when !== "30d";
    return (
      <EmptyState
        title={emptyTitle(f)}
        actions={
          <>
            <Button
              href={
                widen
                  ? agendaHref(f, { when: "30d", day: undefined })
                  : agendaHref({ view: "list", free: false, kids: false, when: "30d" })
              }
              size="md"
            >
              {widen ? AGENDA.widen30 : AGENDA.clearAll}
            </Button>
            <Button href="/agenda/sugerir" size="md" variant="outline">
              {AGENDA.suggest}
            </Button>
          </>
        }
      >
        <p>{AGENDA.emptyText}</p>
      </EmptyState>
    );
  }

  const groups = new Map<string, EventView[]>();
  for (const e of events) {
    const key = localDateKey(e.startsAt);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const mini = await miniCalendar(f, now);
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)]">
      <div className="flex min-w-0 flex-col gap-8">
        <p className="type-meta text-meta">
          {AGENDA.results(total)}
          {f.day && (
            <>
              {" · "}
              <Link
                href={agendaHref(f, { day: undefined })}
                className="font-semibold text-link underline underline-offset-4"
              >
                {AGENDA.seeAllDates}
              </Link>
            </>
          )}
        </p>
        {[...groups.entries()].map(([key, list]) => (
          <section key={key} aria-labelledby={`dia-${key}`} className="flex flex-col">
            <h2 id={`dia-${key}`} className="pb-2 type-section text-strong first-letter:uppercase">
              {formatLongDate(dayStart(key).toISOString())}
            </h2>
            <ol className="flex flex-col">
              {list.map((e) => (
                <li
                  key={e.id}
                  id={e.id === firstNewId ? loadMoreAnchor(firstNew) : undefined}
                  tabIndex={e.id === firstNewId ? -1 : undefined}
                >
                  <EventCard event={e} />
                </li>
              ))}
            </ol>
          </section>
        ))}
        <LoadMore
          href={nextCursor ? moreHref(f, nextCursor, events.length) : null}
          shown={events.length}
          total={total}
          label={AGENDA.loadMore}
        />
        {recurring.length > 0 && (
          <RecurringDates items={recurring} headingLevel={2} id="agenda-recorrentes" />
        )}
      </div>
      {mini && (
        <aside
          aria-label={AGENDA.miniCalendar}
          className="hidden lg:sticky lg:top-sticky-public lg:block lg:self-start"
        >
          {mini}
        </aside>
      )}
    </div>
  );
}

/** Mini-calendário lateral da lista (desktop): contagem por dia do mês com os mesmos filtros. */
async function miniCalendar(f: AgendaFilters, now: Date) {
  const month = f.day ? f.day.slice(0, 7) : calendarMonth(f, now);
  const range = agendaRange({ ...f, view: "cal", month, day: undefined }, now);
  const r = await listEventsInRange(eventFilters(f, range));
  if (!r.ok) return null;
  const counts = new Map<string, number>();
  for (const e of r.value) {
    const key = localDateKey(e.startsAt);
    if (key.startsWith(month)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? `${(y ?? 0) - 1}-12` : `${y}-${String((m ?? 1) - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${(y ?? 0) + 1}-01` : `${y}-${String((m ?? 1) + 1).padStart(2, "0")}`;
  return (
    <AgendaCalendar
      compact
      month={month}
      title={formatMonthYear(month)}
      today={localDateKey(now)}
      prevHref={agendaHref(f, { view: "cal", month: prev, day: undefined })}
      nextHref={agendaHref(f, { view: "cal", month: next, day: undefined })}
      days={[...counts.entries()].map(([key, count]) => ({
        key,
        count,
        label: formatLongDate(dayStart(key).toISOString()),
        href: agendaHref(f, { view: "list", day: key, month: undefined }),
      }))}
    />
  );
}

function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <p className="sr-only">{AGENDA.loading}</p>
      <Skeleton shape="block" className="h-7 w-48" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} media lines={4} className="border-t border-line-subtle py-4" />
      ))}
    </div>
  );
}

export default async function AgendaRoute({ searchParams }: Props) {
  const sp = await searchParams;
  const f = parseAgendaFilters(sp);
  const rawCursor = firstParam(sp, "cursor") ?? "";
  const cursor =
    f.view === "list" && /^[A-Za-z0-9_-]{1,512}$/.test(rawCursor) ? rawCursor : undefined;
  return (
    <div className={`${CONTAINER} flex flex-col gap-6 py-6 lg:py-10`}>
      <header className="flex flex-col gap-4 border-b border-line-strong pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-read flex-col gap-2">
          <p className="type-eyebrow text-eyebrow">{AGENDA.eyebrow}</p>
          <h1 className="type-screen-title text-strong">{AGENDA.title}</h1>
          <p className="type-body text-body max-sm:hidden">{AGENDA.intro}</p>
        </div>
        <Button href="/agenda/sugerir" size="md" variant="outline" icon="plus">
          {AGENDA.suggest}
        </Button>
      </header>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="min-w-0">
            <Shortcuts f={f} />
          </div>
          <ViewToggle f={f} />
        </div>
        <Filters f={f} />
      </div>
      <Suspense key={`${agendaHref(f)}|${cursor ?? ""}`} fallback={<Loading />}>
        <Results f={f} cursor={cursor} />
      </Suspense>
    </div>
  );
}
