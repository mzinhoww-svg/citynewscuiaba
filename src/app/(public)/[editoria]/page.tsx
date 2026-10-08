import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AdSlot,
  ArticleCard,
  Button,
  Chip,
  EmptyState,
  LoadingRegion,
  NewItemsPill,
  SectionFiltersForm,
  Skeleton,
  SponsoredCard,
} from "@/components";
import { neighborhoodBySlug } from "@/content/pt-BR/neighborhoods";
import { SECTIONS } from "@/content/pt-BR/nav";
import { SECTION_DESCRIPTION, SECTION_PAGE } from "@/content/pt-BR/portal-section";
import { CARD } from "@/content/pt-BR/portal-card";
import { getSectionRef, listSection, type SectionPage } from "@/lib/db/queries";
import {
  parseSectionFilters,
  sectionFilterHref,
  serializeSectionFilters,
  widenSectionFilters,
  type SearchParamsInput,
  type SectionFilters,
} from "@/lib/filters/section";
import { formatWhen } from "@/lib/format/date";

/**
 * Editoria (P02). Os filtros vivem na URL, então a página é renderizada por requisição; a
 * revalidação de 60 s vale para o que for estático (P1 Global Constraints, A-035).
 */
export const revalidate = 60;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

type Props = {
  params: Promise<{ editoria: string }>;
  searchParams: Promise<SearchParamsInput>;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Nome da editoria sem banco: o da navegação; desconhecida vira 404. */
function navName(slug: string): string | undefined {
  return SECTIONS.find((s) => s.id === slug)?.label;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { editoria } = await params;
  const filters = parseSectionFilters(await searchParams);
  const name = navName(editoria) ?? editoria;
  const filtered = serializeSectionFilters({ ...filters, page: 1 }) !== "";
  return pageMetadata({
    title: name,
    documentTitle: SECTION_PAGE.metaTitle(name),
    description: SECTION_DESCRIPTION[editoria] ?? SECTION_PAGE.metaDescription(name),
    path: `/${editoria}`,
    // Combinações de filtro não entram no índice: só a editoria "pura" é canônica.
    noindex: filtered || filters.page > 1,
  });
}

function Header({ data, filters }: { data: SectionPage; filters: SectionFilters }) {
  const { section } = data;
  const description = SECTION_DESCRIPTION[section.slug];
  const base = `/${section.slug}`;
  return (
    <header className="flex flex-col gap-4 border-b border-line-strong pb-4">
      <div className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{section.name}</h1>
        {description && <p className="max-w-read type-body text-body">{description}</p>}
        <p className="type-meta text-meta">
          {data.latestAt && (
            <>
              <time dateTime={data.latestAt}>
                {SECTION_PAGE.updated(formatWhen(data.latestAt))}
              </time>
              {" · "}
            </>
          )}
          {SECTION_PAGE.today(data.todayCount)}
        </p>
      </div>
      {data.subsections.length > 0 && (
        <nav aria-label={SECTION_PAGE.subsections}>
          <ul className="flex snap-x gap-2 overflow-x-auto py-1 scrollbar-none">
            <li>
              <Chip
                href={sectionFilterHref(section.slug, filters, { sub: undefined, page: 1 })}
                active={!data.activeSub}
              >
                {SECTION_PAGE.allSubsections}
              </Chip>
            </li>
            {data.subsections.map((s) => (
              <li key={s.slug}>
                <Chip
                  href={sectionFilterHref(section.slug, filters, { sub: s.slug, page: 1 })}
                  active={data.activeSub?.slug === s.slug}
                >
                  {s.name}
                </Chip>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <SectionFiltersForm
        action={base}
        filters={{ ...filters, sub: data.activeSub?.slug }}
        clearHref={data.activeSub ? `${base}?sub=${data.activeSub.slug}` : base}
      />
    </header>
  );
}

function Empty({ data, filters }: { data: SectionPage; filters: SectionFilters }) {
  const what = data.activeSub?.name ?? data.section.name;
  const where = neighborhoodBySlug(filters.neighborhood)?.in ?? "";
  const step = widenSectionFilters({ ...filters, sub: data.activeSub?.slug });
  const label = !step
    ? null
    : step.kind === "period"
      ? step.filters.period === "30d"
        ? SECTION_PAGE.widen.period30
        : SECTION_PAGE.widen.periodAll
      : step.kind === "neighborhood"
        ? SECTION_PAGE.widen.neighborhood
        : SECTION_PAGE.widen.reset;
  return (
    <EmptyState
      title={SECTION_PAGE.emptyTitle(what, where, SECTION_PAGE.periodPhrase[filters.period])}
      actions={
        step && label ? (
          <Button href={sectionFilterHref(data.section.slug, step.filters)} size="md">
            {label}
          </Button>
        ) : (
          <Button href="/" size="md" variant="outline">
            {SECTION_PAGE.backHome}
          </Button>
        )
      }
    >
      <p>{SECTION_PAGE.emptyText}</p>
    </EmptyState>
  );
}

function Section({ data, filters }: { data: SectionPage; filters: SectionFilters }) {
  const slug = data.section.slug;
  const since = data.articles[0]?.publishedAt ?? data.latestAt ?? new Date().toISOString();
  const qs = serializeSectionFilters({ ...filters, sub: data.activeSub?.slug, page: 1 });
  const pillEndpoint = `/api/editoria/${slug}/novas?desde=${encodeURIComponent(since)}${qs ? `&${qs}` : ""}`;
  // O destaque da editoria (pino ou automático, sempre com capa) abre a lista; o patrocinado
  // nativo (B-022, só com o interruptor ligado) já vem intercalado pelas regras fixas.
  const listed = data.feed;
  const adSection = data.activeSub?.slug ?? slug;
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <Header data={data} filters={filters} />
      {/* Campos de banner (ADS-T2): Política, Justiça, Segurança e Saúde nunca recebem peça. */}
      <AdSlot code="TOP" sectionSlug={adSection} />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)]">
        <section aria-labelledby="lista-titulo" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="lista-titulo" className="type-section text-strong">
              {SECTION_PAGE.list(data.activeSub?.name ?? data.section.name)}
            </h2>
            {data.total > 0 && (
              <p className="type-meta text-meta tabular-nums">
                {SECTION_PAGE.count(data.articles.length, data.total)}
              </p>
            )}
          </div>
          <NewItemsPill endpoint={pillEndpoint} targetId="lista-titulo" />
          {listed.length === 0 ? (
            <Empty data={data} filters={filters} />
          ) : (
            <ol id="lista" className="grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-2">
              {listed.map((item, i) =>
                item.kind === "sponsored" ? (
                  <li key={`patrocinado-${item.ad.campaignId}-${i}`}>
                    <SponsoredCard ad={item.ad} />
                  </li>
                ) : (
                  <li key={item.article.id} className={i === 0 ? "md:col-span-2" : undefined}>
                    <ArticleCard
                      variant={i === 0 ? "lead" : "standard"}
                      article={item.article}
                      kicker={
                        i === 0 && data.featuredHot && item.article.id === data.featured?.id
                          ? CARD.hot
                          : undefined
                      }
                    />
                  </li>
                ),
              )}
            </ol>
          )}
          {data.hasMore && (
            <div className="flex justify-center pt-2">
              <Link
                href={sectionFilterHref(slug, filters, {
                  sub: data.activeSub?.slug,
                  page: data.page + 1,
                })}
                scroll={false}
                className="inline-flex h-tap items-center justify-center rounded-pill border border-line-control bg-card-white px-6 text-16 font-semibold text-strong no-underline hover:bg-section"
              >
                {SECTION_PAGE.loadMore}
              </Link>
            </div>
          )}
        </section>
        <div className="flex flex-col gap-8">
          {data.mostRead.length > 0 && (
            <aside aria-labelledby="mais-lidas" className="flex flex-col gap-3">
              <h2 id="mais-lidas" className="type-section text-strong">
                {SECTION_PAGE.mostRead(data.section.name)}
              </h2>
              <ol className="flex flex-col">
                {data.mostRead.map((a, i) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="w-6 shrink-0 pt-4 font-sans text-24 font-black leading-none text-meta tabular-nums"
                    >
                      {i + 1}
                    </span>
                    <ArticleCard variant="list" article={a} className="min-w-0 flex-1" />
                  </li>
                ))}
              </ol>
            </aside>
          )}
          {/* Lateral abaixo de "Mais lidas": retângulo e arranha-céu (este fixo ao rolar). */}
          {/* Blocos secundários (item 87): a lista não espera os campos de banner da lateral.
              O TOP fica fora do Suspense para não empurrar a lista quando chegar. */}
          <Suspense fallback={null}>
            <AdSlot code="RAIL-A" sectionSlug={adSection} />
          </Suspense>
          <div className="lg:sticky lg:top-sticky-public">
            <Suspense fallback={null}>
              <AdSlot code="RAIL-B" sectionSlug={adSection} />
            </Suspense>
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <AdSlot code="STICKY" sectionSlug={adSection} />
      </Suspense>
    </div>
  );
}

function Failure({ name, retryHref }: { name: string; retryHref: string }) {
  return (
    <div className={`${CONTAINER} py-10`}>
      <EmptyState
        as="h1"
        tone="error"
        title={SECTION_PAGE.errorTitle(name)}
        actions={
          <>
            <Button href={retryHref} size="md">
              {SECTION_PAGE.retry}
            </Button>
            <Button href="/" size="md" variant="outline">
              {SECTION_PAGE.backHome}
            </Button>
          </>
        }
      >
        <p>{SECTION_PAGE.errorText}</p>
      </EmptyState>
    </div>
  );
}

/** Carregando: cabeçalho já com o h1 e esqueleto da lista (a checagem de 404 veio antes). */
function SectionLoading({ name }: { name: string }) {
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <header className="flex flex-col gap-3 border-b border-line-strong pb-4">
        <h1 className="type-screen-title text-strong">{name}</h1>
        <Skeleton lines={1} className="max-w-md" />
      </header>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)]">
        <LoadingRegion
          label={SECTION_PAGE.loading}
          className="grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-2"
        >
          {/* Mesma forma da lista pronta: lead em largura total e depois standard em 2 colunas. */}
          <div className="flex flex-col gap-4 md:col-span-2">
            <Skeleton shape="block" className="aspect-video w-full" />
            <Skeleton lines={3} />
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} media lines={3} />
          ))}
        </LoadingRegion>
      </div>
    </div>
  );
}

async function SectionContent({ slug, filters }: { slug: string; filters: SectionFilters }) {
  const result = await listSection(slug, filters, filters.page);
  if (!result.ok) {
    return <Failure name={navName(slug) ?? slug} retryHref={sectionFilterHref(slug, filters)} />;
  }
  if (!result.value) notFound();
  return <Section data={result.value} filters={filters} />;
}

export default async function SectionRoute({ params, searchParams }: Props) {
  const { editoria } = await params;
  if (!SLUG.test(editoria)) notFound();
  const filters = parseSectionFilters(await searchParams);
  // Existência antes do streaming: editoria desconhecida responde 404 de verdade.
  const ref = await getSectionRef(editoria);
  if (!ref.ok) {
    const name = navName(editoria);
    if (!name) notFound();
    return <Failure name={name} retryHref={sectionFilterHref(editoria, filters)} />;
  }
  if (!ref.value) notFound();
  return (
    <Suspense
      key={serializeSectionFilters({ ...filters, page: 1 })}
      fallback={<SectionLoading name={ref.value.name} />}
    >
      <SectionContent slug={editoria} filters={filters} />
    </Suspense>
  );
}
