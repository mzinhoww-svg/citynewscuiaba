import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Button,
  CategoryTag,
  EmptyState,
  JsonLd,
  ReportVenueForm,
  VenueCover,
  VenueEvents,
  categoryLabel,
  ratingText,
} from "@/components";
import { dataLine, GUIDE } from "@/content/pt-BR/guide";
import { upcomingEventsAtVenue } from "@/lib/db/queries/events";
import { getGuideVenue } from "@/lib/db/queries/guide";
import { formatDate } from "@/lib/format/date";
import { venueJsonLd } from "@/lib/guide/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";

/**
 * Página do lugar: contato, horário, fotos oficiais com crédito, as listas em que aparece e os
 * próximos eventos da Agenda ligados a ele (até 5; sem eventos ou com a agenda fora, a seção some).
 */
export const revalidate = 3600;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = SLUG.test(slug) ? await getGuideVenue(slug) : null;
  const page = r && r.ok ? r.value : null;
  if (!page)
    return pageMetadata({
      title: GUIDE.nav.index,
      path: `/guia-cuiaba/lugar/${slug}`,
      noindex: true,
    });
  const v = page.venue;
  return pageMetadata({
    title: v.name,
    documentTitle: GUIDE.venue.metaTitle(v.name),
    description: GUIDE.venue.metaDescription(
      v.name,
      categoryLabel(v.category).toLowerCase(),
      v.neighborhood ? `no bairro ${v.neighborhood}` : "",
    ),
    path: v.href,
    // A foto do Google (A-212) só aparece na página, com o crédito; nunca em metadados.
    ...(v.photos[0] && !v.photos[0].fromGoogle ? { images: [v.photos[0].src] } : {}),
  });
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line-subtle py-3 sm:flex-row sm:gap-6">
      <dt className="type-meta font-semibold text-strong sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="type-body text-body">{children}</dd>
    </div>
  );
}

export default async function GuideVenuePage({ params }: Props) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const result = await getGuideVenue(slug);
  if (!result.ok) {
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone="error"
          title={GUIDE.venue.errorTitle}
          actions={
            <>
              <Button href={`/guia-cuiaba/lugar/${slug}`} size="md">
                {GUIDE.index.retry}
              </Button>
              <Button href="/guia-cuiaba" size="md" variant="outline">
                {GUIDE.nav.back}
              </Button>
            </>
          }
        >
          <p>{GUIDE.index.errorText}</p>
        </EmptyState>
      </div>
    );
  }
  const page = result.value;
  if (!page) notFound();
  const { venue: v, lists } = page;
  const upcoming = await upcomingEventsAtVenue(v.id);
  const events = upcoming.ok ? upcoming.value : [];
  const telHref = v.phone ? `tel:${v.phone.replace(/[^\d+]/g, "")}` : null;
  const data = dataLine(v.sources);

  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <JsonLd
        data={venueJsonLd({
          slug: v.slug,
          name: v.name,
          category: v.category,
          address: v.address,
          neighborhood: v.neighborhood,
          phone: v.phone,
          website: v.website,
          instagram: v.instagram,
          hours: v.hours,
          lat: v.lat,
          lng: v.lng,
          images: v.photos.filter((p) => !p.fromGoogle).map((p) => p.src),
        })}
      />
      <header className="flex flex-col gap-3 border-b border-line-strong pb-5">
        <p>
          <Link href="/guia-cuiaba" className="type-meta text-link underline underline-offset-4">
            {GUIDE.nav.back}
          </Link>
        </p>
        <CategoryTag tone="service">
          {[categoryLabel(v.category), v.neighborhood].filter(Boolean).join(" · ")}
        </CategoryTag>
        <h1 className="type-screen-title text-strong">{v.name}</h1>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-6">
          <VenueCover
            name={v.name}
            categoryLabel={categoryLabel(v.category)}
            photo={v.photos[0]}
            size="hero"
          />
          {v.photos.length > 1 && (
            <section aria-labelledby="fotos-do-lugar" className="flex flex-col gap-3">
              <h2 id="fotos-do-lugar" className="type-section text-strong">
                {GUIDE.venue.photos}
              </h2>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {v.photos.slice(1).map((p) => (
                  <li key={p.src}>
                    <VenueCover
                      name={v.name}
                      categoryLabel={categoryLabel(v.category)}
                      photo={p}
                      size="hero"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {v.photos.length === 0 && <p className="type-meta text-meta">{GUIDE.venue.noPhoto}</p>}
        </div>

        <section aria-labelledby="dados-do-lugar" className="flex flex-col gap-2">
          <h2 id="dados-do-lugar" className="sr-only">
            {v.name}
          </h2>
          <dl className="flex flex-col">
            {v.address && <Fact label={GUIDE.venue.address}>{v.address}</Fact>}
            {v.phone && telHref && (
              <Fact label={GUIDE.venue.phone}>
                <a href={telHref} className="text-link underline underline-offset-4">
                  {v.phone}
                </a>
              </Fact>
            )}
            {v.hours && <Fact label={GUIDE.venue.hours}>{v.hours}</Fact>}
            {v.website && (
              <Fact label={GUIDE.venue.site}>
                <a
                  href={v.website}
                  rel="noopener noreferrer"
                  className="break-all text-link underline underline-offset-4"
                >
                  {v.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </Fact>
            )}
            {v.instagram && (
              <Fact label={GUIDE.venue.instagram}>
                <a
                  href={v.instagram}
                  rel="noopener noreferrer"
                  className="break-all text-link underline underline-offset-4"
                >
                  {v.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@")}
                </a>
              </Fact>
            )}
            {v.priceLevel && (
              <Fact label={GUIDE.venue.priceLabel}>{GUIDE.venue.price(v.priceLevel)}</Fact>
            )}
            {v.rating !== null &&
              (v.ratingSource === "google" || v.ratingSource === "tripadvisor") && (
                <Fact label="Avaliações">
                  {GUIDE.list.rating(ratingText(v.rating), v.ratingCount, v.ratingSource)}
                  {v.googleMapsUrl && (
                    <>
                      {" · "}
                      <a
                        href={v.googleMapsUrl}
                        rel="noopener noreferrer"
                        className="text-link underline underline-offset-4"
                      >
                        {GUIDE.venue.googleMaps}
                      </a>
                    </>
                  )}
                  {v.tripadvisorRank !== null && <> · {GUIDE.list.rank(v.tripadvisorRank)}</>}
                  {v.tripadvisorUrl && (
                    <>
                      {" · "}
                      <a
                        href={v.tripadvisorUrl}
                        rel="noopener noreferrer"
                        className="text-link underline underline-offset-4"
                      >
                        {GUIDE.venue.tripadvisor}
                      </a>
                    </>
                  )}
                </Fact>
              )}
          </dl>
        </section>
      </div>

      {lists.length > 0 && (
        <section aria-labelledby="listas-do-lugar" className="flex flex-col gap-2">
          <h2 id="listas-do-lugar" className="type-section text-strong">
            {GUIDE.venue.appearsIn}
          </h2>
          <ul className="flex flex-col gap-1">
            {lists.map((l) => (
              <li key={l.slug} className="type-body text-body">
                <Link href={l.href} className="text-link underline underline-offset-4">
                  {l.title}
                </Link>{" "}
                <span className="text-meta">· {GUIDE.list.position(l.position)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <VenueEvents events={events} />

      <p className="type-meta text-meta">
        {data && <span>{data}. </span>}
        {v.updatedAt && (
          <time dateTime={v.updatedAt}>{GUIDE.venue.updated(formatDate(v.updatedAt))}</time>
        )}
      </p>
      <ReportVenueForm venueId={v.id} />
    </div>
  );
}
