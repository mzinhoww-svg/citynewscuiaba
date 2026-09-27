import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import {
  AgendaCalendar,
  Button,
  EmptyState,
  EventDateBadge,
  Select,
  Skeleton,
  cx,
} from "@/components";
import { NEIGHBORHOODS, neighborhoodBySlug } from "@/content/pt-BR/neighborhoods";
import { AGENDA } from "@/content/pt-BR/portal";
import { listEvents, type EventView } from "@/lib/db/queries";
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
import type { SearchParamsInput } from "@/lib/filters/section";
import {
  dayStart,
  formatHour,
  formatLongDate,
  formatMonthYear,
  localDateKey,
} from "@/lib/format/date";

/** Agenda (P09): filtros e visão na URL, renderizada por requisição. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: AGENDA.metaTitle,
  description: AGENDA.metaDescription,
  alternates: { canonical: "/agenda" },
};

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
      className="inline-flex gap-0.5 rounded-pill bg-section p-0.5"
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
                ? "bg-card-white font-semibold text-link shadow-sm"
                : "font-medium text-meta hover:text-strong",
            )}
          >
            {v.label}
          </button>
        </Form>
      ))}
    </div>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex min-h-tap cursor-pointer items-center gap-3 type-body text-strong">
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        className="size-5 shrink-0 accent-(--action-primary)"
      />
      {label}
    </label>
  );
}

function Filters({ f }: { f: AgendaFilters }) {
  return (
    <details
      open={f.free || f.kids || !!f.category || !!f.neighborhood || !!f.origin || f.when !== "30d"}
      className="group"
    >
      <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-2 rounded-pill border border-line-control bg-card-white px-5 text-14 font-semibold text-strong hover:bg-section [&::-webkit-details-marker]:hidden">
        {AGENDA.filters}
      </summary>
      <Form
        action="/agenda"
        key={agendaHref(f)}
        autoComplete="off"
        className="mt-4 grid grid-cols-1 gap-4 border-t border-line-subtle pt-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {f.view === "cal" && <input type="hidden" name="view" value="cal" />}
        {f.view === "cal" && f.month && <input type="hidden" name="mes" value={f.month} />}
        {f.view === "list" && (
          <Select
            id="agenda-quando"
            name="quando"
            label={AGENDA.when}
            defaultValue={AGENDA_PARAM_VALUES.when[f.when]}
            options={(Object.keys(AGENDA.whens) as AgendaWhen[]).map((w) => ({
              value: AGENDA_PARAM_VALUES.when[w],
              label: AGENDA.whens[w],
            }))}
          />
        )}
        <Select
          id="agenda-categoria"
          name="categoria"
          label={AGENDA.category}
          placeholder={AGENDA.allCategories}
          defaultValue={f.category ?? ""}
          options={AGENDA_CATEGORIES.map((c) => ({ value: c, label: AGENDA.categories[c] ?? c }))}
        />
        <Select
          id="agenda-bairro"
          name="bairro"
          label={AGENDA.neighborhood}
          placeholder={AGENDA.allNeighborhoods}
          defaultValue={f.neighborhood ?? ""}
          options={NEIGHBORHOODS.map((n) => ({ value: n.slug, label: n.name }))}
        />
        <Select
          id="agenda-origem"
          name="origem"
          label={AGENDA.origin}
          placeholder={AGENDA.allOrigins}
          defaultValue={f.origin ? AGENDA_PARAM_VALUES.origin[f.origin] : ""}
          options={(Object.keys(AGENDA.origins) as AgendaOrigin[]).map((o) => ({
            value: AGENDA_PARAM_VALUES.origin[o],
            label: AGENDA.origins[o],
          }))}
        />
        <fieldset className="flex flex-wrap gap-x-6 sm:col-span-2">
          <legend className="sr-only">{AGENDA.priceLabel}</legend>
          <Check name="gratuito" label={AGENDA.freeOnly} checked={f.free} />
          <Check name="criancas" label={AGENDA.kidsOnly} checked={f.kids} />
        </fieldset>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-2 lg:col-span-2 lg:justify-end">
          <Button type="submit" size="md">
            {AGENDA.apply}
          </Button>
          <Link
            href={f.view === "cal" ? "/agenda?view=cal" : "/agenda"}
            className="inline-flex min-h-tap items-center text-14 font-semibold text-link underline underline-offset-4 hover:text-strong"
          >
            {AGENDA.clear}
          </Link>
        </div>
      </Form>
    </details>
  );
}

function eventMeta(e: EventView): string {
  const end = e.endsAt
    ? localDateKey(e.endsAt) !== localDateKey(e.startsAt)
      ? `${AGENDA.until(formatHour(e.endsAt))} ${AGENDA.nextDay}`
      : AGENDA.until(formatHour(e.endsAt))
    : "";
  const price = e.isFree ? AGENDA.free : AGENDA.price(e.priceCents ?? 0);
  return [
    [formatHour(e.startsAt), end].filter(Boolean).join(" "),
    e.neighborhood ? `${e.venue}, ${e.neighborhood}` : e.venue,
    price,
  ].join(" · ");
}

function EventRow({ e }: { e: EventView }) {
  return (
    <article className="relative flex items-start gap-4 border-t border-line-subtle py-4 [--card-radius:var(--r-0)]">
      <EventDateBadge startsAt={e.startsAt} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="type-eyebrow text-eyebrow">
          {AGENDA.categories[e.category] ?? e.category} · {AGENDA.origins[e.origin]}
        </p>
        <h3 className="type-headline-sm text-strong">
          <Link href={e.href} className="card-link no-underline">
            {e.title}
          </Link>
        </h3>
        <p className="type-meta text-meta">{eventMeta(e)}</p>
        <p className="type-meta text-meta">{AGENDA.age(e.ageRating)}</p>
      </div>
    </article>
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

async function Results({ f }: { f: AgendaFilters }) {
  const now = new Date();
  const range = agendaRange(f, now);
  const r = await listEvents({
    from: range.from,
    to: range.to,
    freeOnly: f.free,
    kidsOnly: f.kids,
    category: f.category,
    neighborhood: f.neighborhood ? neighborhoodBySlug(f.neighborhood)?.name : undefined,
    origin: f.origin,
    limit: 100,
  });
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
  const events = r.value;

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
  return (
    <div className="flex flex-col gap-8">
      <p className="type-meta text-meta">
        {AGENDA.results(events.length)}
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
              <li key={e.id}>
                <EventRow e={e} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <p className="sr-only">{AGENDA.loading}</p>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} lines={3} />
      ))}
    </div>
  );
}

export default async function AgendaRoute({ searchParams }: Props) {
  const f = parseAgendaFilters(await searchParams);
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <header className="flex flex-col gap-4 border-b-2 border-line-strong pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-read flex-col gap-2">
          <p className="type-eyebrow text-eyebrow">{AGENDA.eyebrow}</p>
          <h1 className="type-display text-strong">{AGENDA.title}</h1>
          <p className="type-body text-body">{AGENDA.intro}</p>
        </div>
        <Button href="/agenda/sugerir" size="md" variant="outline" icon="plus">
          {AGENDA.suggest}
        </Button>
      </header>
      <div className="flex flex-col gap-4">
        <ViewToggle f={f} />
        <Filters f={f} />
      </div>
      <Suspense key={agendaHref(f)} fallback={<Loading />}>
        <Results f={f} />
      </Suspense>
    </div>
  );
}
