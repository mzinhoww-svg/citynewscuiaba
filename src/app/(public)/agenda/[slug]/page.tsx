import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState, EventDateBadge, Icon, ShareSheet, type IconName } from "@/components";
import { AGENDA } from "@/content/pt-BR/portal";
import { getEvent, listEvents, type EventView } from "@/lib/db/queries";
import {
  formatDateTime,
  formatDayMonth,
  formatHour,
  formatLongDate,
  localDateKey,
} from "@/lib/format/date";
import { googleCalendarUrl } from "@/lib/ics";
import { eventJsonLd, ldScript, siteUrl } from "@/lib/seo/jsonld";

/** Evento (P10): ISR de 5 min. */
export const revalidate = 300;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG.test(slug)) return {};
  const r = await getEvent(slug);
  if (!r.ok || !r.value) return {};
  return {
    title: `${r.value.title} · ${AGENDA.metaTitle}`,
    description: r.value.description ?? undefined,
    alternates: { canonical: r.value.href },
  };
}

function when(e: EventView): string {
  const start = `${formatLongDate(e.startsAt)}, ${formatHour(e.startsAt)}`;
  if (!e.endsAt) return start;
  const nextDay = localDateKey(e.endsAt) !== localDateKey(e.startsAt);
  return `${start} ${AGENDA.until(formatHour(e.endsAt))}${nextDay ? ` ${AGENDA.nextDay}` : ""}`;
}

function Fact({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line-subtle py-3">
      <dt className="flex items-center gap-2 type-meta text-meta">
        <Icon name={icon} size={18} className="shrink-0" />
        {label}
      </dt>
      <dd className="pl-6.5 type-body text-strong">{children}</dd>
    </div>
  );
}

function Event({ e, related }: { e: EventView; related: EventView[] }) {
  const place = e.neighborhood ? `${e.venue}, ${e.neighborhood}, Cuiabá` : `${e.venue}, Cuiabá`;
  const cal = {
    uid: e.id,
    title: e.title,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    venue: place,
    url: `${siteUrl()}${e.href}`,
  };
  const category = AGENDA.categories[e.category] ?? e.category;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldScript(eventJsonLd({ ...e })) }}
      />
      <div className={`${CONTAINER} flex flex-col gap-10 py-8 lg:py-10`}>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)] lg:gap-14">
          <article className="flex min-w-0 max-w-read flex-col gap-6">
            <Link
              href="/agenda"
              className="inline-flex min-h-tap items-center gap-1.5 self-start text-14 font-semibold text-link underline underline-offset-4 hover:text-strong"
            >
              <Icon name="arrow-left" size={16} />
              {AGENDA.backAgenda}
            </Link>
            <header className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <EventDateBadge startsAt={e.startsAt} />
                <p className="type-eyebrow text-eyebrow">
                  {category} · {AGENDA.origins[e.origin]}
                </p>
              </div>
              <h1 className="type-headline-xl text-balance text-strong">{e.title}</h1>
            </header>
            <dl className="flex flex-col">
              <Fact icon="calendar" label={AGENDA.when2}>
                <time dateTime={e.startsAt} className="first-letter:uppercase">
                  {when(e)}
                </time>
              </Fact>
              <Fact icon="map-pin" label={AGENDA.where}>
                {place}
                <br />
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-tap items-center gap-1.5 text-14 font-semibold text-link underline underline-offset-4"
                >
                  {AGENDA.directions}
                  <Icon name="external-link" size={14} />
                  <span className="sr-only"> ({AGENDA.newTab})</span>
                </a>
              </Fact>
              <Fact icon="ticket" label={AGENDA.priceLabel}>
                {e.isFree ? AGENDA.free : AGENDA.price(e.priceCents ?? 0)}
              </Fact>
              <Fact icon="users" label={AGENDA.ageLabel}>
                {AGENDA.age(e.ageRating)}
              </Fact>
              {e.accessibility && (
                <Fact icon="accessibility" label={AGENDA.accessibility}>
                  {e.accessibility}
                </Fact>
              )}
            </dl>
            {e.description && (
              <section aria-labelledby="sobre-evento" className="flex flex-col gap-2">
                <h2 id="sobre-evento" className="type-section text-strong">
                  {AGENDA.description}
                </h2>
                <p className="reading-body text-body">{e.description}</p>
              </section>
            )}
            <p className="flex items-start gap-2 bg-cerrado-soft px-4 py-3 type-meta text-service">
              <Icon name="check" size={16} className="mt-0.5 shrink-0" />
              <span>
                {AGENDA.originLabel}: {AGENDA.origins[e.origin]}.{" "}
                {e.confirmedAt && AGENDA.confirmed(formatDayMonth(e.confirmedAt))}
              </span>
            </p>
          </article>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
            <section aria-labelledby="adicionar" className="flex flex-col gap-3 bg-section p-5">
              <h2 id="adicionar" className="type-section text-strong">
                {AGENDA.addToCalendar}
              </h2>
              <Button href={`/api/ics/${e.slug}`} size="md" icon="download" fullWidth>
                {AGENDA.ics}
              </Button>
              <a
                href={googleCalendarUrl(cal)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-tap w-full items-center justify-center gap-2 rounded-pill border border-line-control bg-card-white px-5 text-16 font-semibold text-strong no-underline hover:bg-section"
              >
                {AGENDA.google}
                <Icon name="external-link" size={16} />
                <span className="sr-only"> ({AGENDA.newTab})</span>
              </a>
              <ShareSheet title={e.title} url={e.href} className="w-full" />
            </section>
          </aside>
        </div>

        {related.length > 0 && (
          <section
            aria-labelledby="relacionados"
            className="flex flex-col gap-2 border-t-2 border-line-strong pt-6"
          >
            <h2 id="relacionados" className="type-section text-strong">
              {AGENDA.related} {category.toLowerCase()}
            </h2>
            <ul className="grid grid-cols-1 gap-x-8 md:grid-cols-3">
              {related.map((r) => (
                <li
                  key={r.id}
                  className="relative flex items-center gap-4 border-t border-line-subtle py-3 [--card-radius:var(--r-0)]"
                >
                  <EventDateBadge startsAt={r.startsAt} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="type-headline-sm text-strong">
                      <Link href={r.href} className="card-link no-underline">
                        {r.title}
                      </Link>
                    </h3>
                    <p className="type-meta text-meta">
                      {formatDateTime(r.startsAt)} · {r.venue}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

export default async function EventRoute({ params }: Props) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const r = await getEvent(slug);
  if (!r.ok) {
    if (r.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
      throw new Error(`Evento indisponível: ${r.error.message}`);
    }
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone="error"
          title={AGENDA.eventError}
          actions={
            <Button href="/agenda" size="md" variant="outline">
              {AGENDA.backAgenda}
            </Button>
          }
        >
          <p>{AGENDA.errorText}</p>
        </EmptyState>
      </div>
    );
  }
  if (!r.value) notFound();
  const related = await listEvents({ category: r.value.category, excludeId: r.value.id, limit: 3 });
  return <Event e={r.value} related={related.ok ? related.value : []} />;
}
