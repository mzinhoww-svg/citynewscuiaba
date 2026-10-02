import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AggregatedCard,
  BrokenLinkReport,
  Button,
  Chip,
  EmptyState,
  Icon,
  JsonLd,
  SourceAvatar,
  SourceBadges,
  SourceFollow,
} from "@/components";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { LOCALITY_TEXT, SOURCE_TEXT } from "@/content/pt-BR/recommendations";
import { SOURCE_CATEGORY_TEXT, SOURCE_PAGE_TEXT as T, SOURCES_PAGE } from "@/content/pt-BR/sources";
import { getSourceDetail, listSourceItems, type SourceDetail } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/format/date";
import { formatReach } from "@/lib/ranking";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { belongsTo } from "@/lib/sources/owner";
import { monogram } from "@/lib/sources/screen";
import { reportProblemAction } from "../../materia/[slug]/actions";

/**
 * Página da fonte (P15): indexável, com os itens como cards agregados que abrem o original e a
 * ficha "Sobre esta fonte no CityNews". Sem banco, estado amigável; login nunca exigido.
 */
const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function load(slug: string) {
  if (!SLUG.test(slug) || slug.length > 120) return null;
  return getSourceDetail(slug);
}

const where = (s: SourceDetail) => LOCALITY_TEXT[s.locality] ?? s.locality;
const listFormat = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" });
const categoryList = (s: SourceDetail) =>
  listFormat.format(
    s.categories.flatMap((c) => {
      const name = SOURCE_CATEGORY_TEXT[c];
      return name ? [name.toLowerCase()] : [];
    }),
  );

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  if (!r?.ok || !r.value) return { title: SOURCES_PAGE.metaTitle };
  const s = r.value;
  return pageMetadata({
    title: s.name,
    documentTitle: T.metaTitle(s.name),
    description: T.metaDescription(s.name, where(s)),
    path: s.href,
  });
}

function About({ s }: { s: SourceDetail }) {
  const rows: [string, string][] = [
    [T.integration, T.kinds[s.kind] ?? s.kind],
    [T.frequency, T.every(s.frequencyMinutes)],
    [T.display, T.displayText[s.republishPolicy] ?? s.republishPolicy],
    [T.images, T.imagesText[s.imagePolicy] ?? s.imagePolicy],
    [
      T.agreement,
      s.agreementUntil
        ? T.agreementUntil(s.agreementUntil.split("-").reverse().join("/"))
        : T.noAgreement,
    ],
    [
      T.availability,
      s.availability === null
        ? T.availabilityNone
        : T.availabilityText(Math.round(s.availability * 100)),
    ],
  ];
  return (
    <section
      aria-labelledby="sobre-fonte"
      className="flex flex-col gap-4 border border-line-section bg-card-white p-5"
    >
      <h2 id="sobre-fonte" className="type-section text-strong">
        {T.aboutTitle}
      </h2>
      <dl className="flex flex-col">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 border-t border-line-subtle py-2.5">
            <dt className="type-meta font-semibold text-strong">{k}</dt>
            <dd className="type-body text-body">{v}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-0.5 border-t border-line-subtle py-2.5">
          <dt className="type-meta font-semibold text-strong">{T.contact}</dt>
          <dd>
            <Link
              href={T.contactHref}
              className="inline-flex min-h-tap items-center text-16 text-link underline underline-offset-4"
            >
              {T.contactText}
            </Link>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default async function SourceRoute({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const r = await load(slug);
  if (!r) notFound();
  if (!r.ok) {
    const unconfigured = r.error.kind === "unconfigured";
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone={unconfigured ? "empty" : "error"}
          title={unconfigured ? SOURCES_PAGE.unconfiguredTitle : T.errorTitle}
          actions={
            <Button href={unconfigured ? "/" : `/fontes/${slug}`} size="md" variant="outline">
              {unconfigured ? SOURCES_PAGE.backHome : SOURCES_PAGE.retry}
            </Button>
          }
        >
          <p>{unconfigured ? SOURCES_PAGE.unconfiguredText : T.errorText}</p>
        </EmptyState>
      </div>
    );
  }
  const s = r.value;
  if (!s) notFound();

  const editoria = typeof sp.editoria === "string" ? sp.editoria : undefined;
  const section = editoria && s.categories.includes(editoria) ? editoria : undefined;
  const items = await listSourceItems(s.slug, section, 20);
  const now = new Date();

  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-6 lg:py-10`}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: ARTICLE.home, path: "/" },
          { name: T.sourcesLink, path: "/fontes" },
          { name: s.name, path: s.href },
        ])}
      />
      <nav aria-label={T.breadcrumb}>
        <ol className="flex flex-wrap items-center gap-x-2 type-meta text-meta">
          <li>
            <Link href="/" className="inline-flex min-h-tap items-center hover:text-strong">
              {ARTICLE.home}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/fontes" className="inline-flex min-h-tap items-center hover:text-strong">
              {T.sourcesLink}
            </Link>
          </li>
        </ol>
      </nav>

      <header className="flex flex-col gap-4 border-b-2 border-line-strong pb-6">
        <div className="flex items-start gap-4">
          <SourceAvatar name={s.name} code={monogram(s.name)} size={72} decorative />
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="type-headline-xl text-balance text-strong">{s.name}</h1>
            <SourceBadges verified={s.verified} />
          </div>
        </div>
        <p className="max-w-read type-body text-body">{T.intro(categoryList(s), where(s))}</p>
        <p className="flex items-center gap-2 type-body font-semibold text-strong">
          <Icon name="info" size={18} />
          {belongsTo(s.name)}
        </p>
        <dl
          aria-label={T.statsLabel}
          className="flex flex-wrap gap-x-6 gap-y-2 type-meta text-meta"
        >
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{T.reach}</dt>
            <Icon name="users" size={16} />
            <dd>{formatReach(s.reach)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">{T.today}</dt>
            <Icon name="newspaper" size={16} />
            <dd>{SOURCE_TEXT.todayText(s.itemsToday)}</dd>
          </div>
          {s.lastUpdatedAt && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">{T.updated}</dt>
              <Icon name="clock" size={16} />
              <dd>
                <time dateTime={s.lastUpdatedAt}>{formatDateTime(s.lastUpdatedAt)}</time>
              </dd>
            </div>
          )}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <SourceFollow slug={s.slug} name={s.name} />
          <a
            href={s.baseUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={T.openSiteLabel(s.name)}
            className="inline-flex h-tap items-center gap-2 rounded-pill border border-line-control bg-card-white px-5 text-16 font-semibold text-strong no-underline hover:bg-section"
          >
            {T.openSite}
            <Icon name="external-link" size={16} />
          </a>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)] lg:gap-14">
        <section aria-labelledby="itens-fonte" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="itens-fonte" className="type-section text-strong">
              {T.itemsTitle}
            </h2>
            <p className="flex items-center gap-1.5 type-meta text-meta">
              <Icon name="external-link" size={14} />
              {T.itemsNotice}
            </p>
          </div>
          {s.categories.length > 1 && (
            <nav aria-label={T.filterLabel}>
              <ul className="flex snap-x gap-2 overflow-x-auto py-1 scrollbar-none">
                <li className="snap-start">
                  <Chip href={s.href} active={!section}>
                    {T.all}
                  </Chip>
                </li>
                {s.categories.map((c) => (
                  <li key={c} className="snap-start">
                    <Chip href={`${s.href}?editoria=${c}`} active={section === c}>
                      {SOURCE_CATEGORY_TEXT[c] ?? c}
                    </Chip>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {!items.ok || items.value.length === 0 ? (
            <EmptyState
              title={section ? T.itemsEmptyFiltered : T.itemsEmpty}
              tone={items.ok ? "empty" : "error"}
              actions={
                <Button href={section ? s.href : "/fontes"} size="md" variant="outline">
                  {section ? T.all : T.backToSources}
                </Button>
              }
            >
              <p>{items.ok ? T.itemsEmptyText : T.errorText}</p>
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {items.value.map((item) => (
                <li key={item.id} className="flex min-w-0 flex-col gap-1">
                  <AggregatedCard item={item} cta="original" now={now} className="flex-1" />
                  <BrokenLinkReport
                    itemId={item.id}
                    title={item.title}
                    action={reportProblemAction}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <About s={s} />
        </aside>
      </div>
    </div>
  );
}
