import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AggregatedCard,
  ArticleCard,
  Button,
  EmptyState,
  EventDateBadge,
  JsonLd,
  ShareSheet,
  TopicSummaryCard,
} from "@/components";
import { COLLECTION } from "@/content/pt-BR/explore";
import { HOME } from "@/content/pt-BR/portal-home";
import { getCollectionBySlug, type CollectionDetail, type CollectionEntry } from "@/lib/db/queries";
import { formatDateTime, formatHour } from "@/lib/format/date";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

/** Coleção (P08): dados em cache por 300 s com a tag `collection:<slug>`. */
export const revalidate = 300;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!SLUG.test(slug) || slug.length > 200) return null;
  return getCollectionBySlug(slug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  if (!r?.ok || !r.value) return {};
  return pageMetadata({
    title: r.value.title,
    documentTitle: COLLECTION.metaTitle(r.value.title),
    description: r.value.description,
    path: r.value.href,
  });
}

function Entry({ entry }: { entry: CollectionEntry }) {
  switch (entry.kind) {
    case "article":
      return <ArticleCard variant="list" article={entry.item} />;
    case "topic":
      return <TopicSummaryCard topic={entry.item} />;
    case "aggregated":
      return <AggregatedCard item={entry.item} />;
    case "event": {
      const e = entry.item;
      const price = e.isFree ? HOME.free : HOME.price(e.priceCents ?? 0);
      return (
        <article className="relative flex items-center gap-4 [--card-radius:var(--r-0)]">
          <EventDateBadge startsAt={e.startsAt} />
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="type-headline-sm text-strong">
              <Link href={e.href} className="card-link no-underline">
                {e.title}
              </Link>
            </h3>
            <p className="type-meta text-meta">
              {[formatHour(e.startsAt), e.venue, price].join(" · ")}
            </p>
          </div>
        </article>
      );
    }
  }
}

function Collection({ c }: { c: CollectionDetail }) {
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-6 lg:py-10`}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: COLLECTION.home, path: "/" },
          { name: COLLECTION.explore, path: "/explorar" },
          { name: c.title, path: c.href },
        ])}
      />
      <nav aria-label={COLLECTION.breadcrumb}>
        <ol className="flex flex-wrap items-center gap-x-2 type-meta text-meta">
          <li>
            <Link href="/" className="inline-flex min-h-tap items-center hover:text-strong">
              {COLLECTION.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/explorar" className="inline-flex min-h-tap items-center hover:text-strong">
              {COLLECTION.explore}
            </Link>
          </li>
        </ol>
      </nav>
      <header className="flex max-w-read flex-col gap-3 border-b-2 border-line-strong pb-6">
        <p className="type-eyebrow text-eyebrow">{COLLECTION.eyebrow}</p>
        <h1 className="type-headline-xl text-balance text-strong">{c.title}</h1>
        <p className="font-serif text-20 leading-snug text-body">{c.description}</p>
        <p className="flex flex-wrap gap-x-1.5 type-meta text-meta">
          <span>{c.curator ? COLLECTION.curatedBy(c.curator) : COLLECTION.curatedByNewsroom}</span>
          <span aria-hidden="true">·</span>
          <span>
            {COLLECTION.updated}
            <time dateTime={c.updatedAt} className="tabular-nums">
              {formatDateTime(c.updatedAt)}
            </time>
          </span>
          <span aria-hidden="true">·</span>
          <span>{COLLECTION.count(c.items.length)}</span>
        </p>
        <div>
          <ShareSheet title={c.title} url={c.href} sheetTitle={COLLECTION.shareTitle} />
        </div>
      </header>
      {c.items.length === 0 ? (
        <EmptyState
          title={COLLECTION.empty}
          actions={
            <Button href="/explorar#colecoes" size="md">
              {COLLECTION.seeExplore}
            </Button>
          }
        >
          <p>{COLLECTION.emptyText}</p>
        </EmptyState>
      ) : (
        <ol aria-label={COLLECTION.items} className="flex max-w-read flex-col">
          {c.items.map((entry, i) => (
            <li
              key={`${entry.kind}:${entry.item.id}`}
              className="flex gap-4 border-t border-line-subtle py-5"
            >
              <span
                aria-hidden="true"
                className="w-8 shrink-0 font-sans text-20 font-black leading-none text-meta tabular-nums"
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="type-eyebrow text-meta">{COLLECTION.kinds[entry.kind]}</p>
                <Entry entry={entry} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default async function CollectionRoute({ params }: Props) {
  const { slug } = await params;
  const r = await load(slug);
  if (!r) notFound();
  if (!r.ok) {
    if (r.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
      throw new Error(`Coleção indisponível: ${r.error.message}`);
    }
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone="error"
          title={COLLECTION.errorTitle}
          actions={
            <>
              <Button href={`/colecoes/${slug}`} size="md">
                {COLLECTION.retry}
              </Button>
              <Button href="/explorar" size="md" variant="outline">
                {COLLECTION.backExplore}
              </Button>
            </>
          }
        >
          <p>{COLLECTION.errorText}</p>
        </EmptyState>
      </div>
    );
  }
  if (!r.value) notFound();
  return <Collection c={r.value} />;
}
