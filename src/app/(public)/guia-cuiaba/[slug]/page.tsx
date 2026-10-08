import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  Button,
  CategoryTag,
  EmptyState,
  JsonLd,
  ListCard,
  Skeleton,
  VenueCard,
  categoryLabel,
} from "@/components";
import { GUIDE } from "@/content/pt-BR/guide";
import { getGuideList, listGuideLists } from "@/lib/db/queries/guide";
import { googleAttribution } from "@/lib/guide/google-photo";
import { guideListJsonLd } from "@/lib/guide/jsonld";
import { formatDate } from "@/lib/format/date";
import { articleParagraphs } from "@/lib/guide/article";
import { pageMetadata } from "@/lib/seo/metadata";

/** Lista do Guia: texto de abertura, lugares em ordem e a origem dos dados (A-214). */
export const revalidate = 3600;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = SLUG.test(slug) ? await getGuideList(slug) : null;
  const list = r && r.ok ? r.value : null;
  if (!list)
    return pageMetadata({ title: GUIDE.nav.index, path: `/guia-cuiaba/${slug}`, noindex: true });
  return pageMetadata({
    title: list.title,
    description: `${list.title}: ${(list.intro ?? list.criteria).slice(0, 140).trim()}`,
    path: list.href,
    type: "article",
    modifiedTime: list.refreshedAt,
  });
}

/**
 * Atribuição exigida pelos termos dos dados (Google, TripAdvisor e OpenStreetMap), em texto
 * simples. A linha do Google cobre as fotos quando algum lugar usa a foto de lá (A-212).
 */
function Attribution({
  google,
  googlePhotos,
  tripadvisor,
  osm,
}: {
  google: boolean;
  googlePhotos: boolean;
  tripadvisor: boolean;
  osm: boolean;
}) {
  const googleLine = googleAttribution({ ratings: google, photos: googlePhotos });
  if (!googleLine && !tripadvisor && !osm) return null;
  return (
    <p className="type-meta text-meta">
      {googleLine && <>{googleLine} </>}
      {tripadvisor && <>{GUIDE.list.attribution.tripadvisor} </>}
      {osm && (
        <>
          {GUIDE.list.attribution.osm.replace("OpenStreetMap.", "")}
          <a
            href="https://www.openstreetmap.org/copyright"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            OpenStreetMap
          </a>
          .
        </>
      )}
    </p>
  );
}

function OtherListsLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2"
    >
      <p className="sr-only">{GUIDE.list.loading}</p>
      <Skeleton lines={3} />
      <Skeleton lines={3} />
    </div>
  );
}

/** Outras listas do Guia (carrega depois do essencial; a existência da lista já foi checada). */
async function OtherLists({ slug }: { slug: string }) {
  const others = await listGuideLists();
  const more = others.ok
    ? [...others.value.editorial, ...others.value.sponsored]
        .filter((l) => l.slug !== slug)
        .slice(0, 4)
    : [];
  if (more.length === 0) return null;
  return (
    <section aria-labelledby="outras-listas" className="flex flex-col gap-2">
      <h2 id="outras-listas" className="type-section text-strong">
        {GUIDE.list.otherLists}
      </h2>
      <ol className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
        {more.map((l) => (
          <li key={l.slug}>
            <ListCard list={l} />
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function GuideListPage({ params }: Props) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const result = await getGuideList(slug);
  if (!result.ok) {
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone="error"
          title={GUIDE.list.errorTitle}
          actions={
            <>
              <Button href={`/guia-cuiaba/${slug}`} size="md">
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
  const list = result.value;
  if (!list) notFound();
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <JsonLd
        data={guideListJsonLd({
          slug: list.slug,
          title: list.title,
          updatedAt: list.refreshedAt,
          items: list.items.map((i) => ({
            position: i.position,
            name: i.venue.name,
            slug: i.venue.slug,
          })),
        })}
      />
      <header className="flex flex-col gap-3 border-b border-line-strong pb-5">
        <p>
          <Link href="/guia-cuiaba" className="type-meta text-link underline underline-offset-4">
            {GUIDE.nav.back}
          </Link>
        </p>
        <CategoryTag tone="service">{categoryLabel(list.category)}</CategoryTag>
        <h1 className="type-screen-title text-strong">{list.title}</h1>
        {list.sponsored && list.sponsorName && (
          <p className="type-meta font-semibold text-strong">
            {GUIDE.list.sponsoredBy(list.sponsorName)}. {GUIDE.list.sponsoredNote}
          </p>
        )}
        {list.refreshedAt && (
          <p className="type-meta text-meta">
            <time dateTime={list.refreshedAt}>
              {GUIDE.list.updated(formatDate(list.refreshedAt))}
            </time>
          </p>
        )}
      </header>

      {list.intro && (
        <div data-testid="guide-article" className="flex max-w-read flex-col gap-4">
          {articleParagraphs(list.intro).map((p, i) => (
            <p key={i} className="type-body-read text-body">
              {p}
            </p>
          ))}
        </div>
      )}

      <section aria-labelledby="lugares-da-lista" className="flex flex-col">
        <h2 id="lugares-da-lista" className="type-section pb-2 text-strong">
          {GUIDE.list.placesTitle}
        </h2>
        <ol>
          {list.items.map((i) => (
            <li key={i.venue.id}>
              <VenueCard item={i} />
            </li>
          ))}
        </ol>
      </section>

      <Attribution
        google={list.items.some(
          (i) => i.venue.ratingSource === "google" && i.venue.rating !== null,
        )}
        googlePhotos={list.items.some((i) => i.venue.photos[0]?.fromGoogle === true)}
        tripadvisor={list.items.some(
          (i) => i.venue.ratingSource === "tripadvisor" && i.venue.rating !== null,
        )}
        osm={list.dataSources.includes("osm")}
      />

      <Suspense fallback={<OtherListsLoading />}>
        <OtherLists slug={list.slug} />
      </Suspense>
    </div>
  );
}
