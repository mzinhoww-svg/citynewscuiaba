import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { HomeModuleId } from "@/lib/admin/home-layout";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import Link from "next/link";
import {
  AggregatedSection,
  ArticleCard,
  Button,
  CategoryTag,
  CollectionCard,
  EventDateBadge,
  NewsletterForm,
  NowList,
  Rail,
  RecurringDates,
  SectionHeader,
  SectionTabs,
  ServiceTile,
  SourceAvatar,
  TopicSummaryCard,
  UrgentBar,
} from "@/components";
import { upcomingRecurring } from "@/lib/agenda/recurring";
import { HOME, HOME_SERVICES } from "@/content/pt-BR/portal-home";
import { NEWSLETTER } from "@/content/pt-BR/newsletter";
import { getHomeData, type EventView, type HomeData } from "@/lib/db/queries";
import { formatHour, formatLongDate } from "@/lib/format/date";
import { ldScript, organizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { SITE } from "@/content/pt-BR/site";
import { subscribeNewsletterAction } from "./actions";

/** Home: dados em cache por 60 s com a tag `home` (P1 Global Constraints; HTML por requisição por causa do nonce da CSP, A-038). */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: SITE.name,
  documentTitle: SITE.name,
  description: SITE.description,
  path: "/",
});

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

/** Organização e site com busca (architecture §8), só na home. */
function SiteJsonLd() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldScript(organizationJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: ldScript(websiteJsonLd()) }}
      />
    </>
  );
}

function DateStrip({ generatedAt }: { generatedAt?: string }) {
  const iso = generatedAt ?? new Date().toISOString();
  return (
    <div className="bg-section">
      <p className={`${CONTAINER} flex flex-wrap justify-between gap-x-4 py-2 type-meta text-meta`}>
        <span>
          <span className="max-sm:hidden">{HOME.place} · </span>
          {formatLongDate(iso)}
        </span>
        {generatedAt && <span>{HOME.updatedAt(formatHour(generatedAt))}</span>}
      </p>
    </div>
  );
}

function NewsletterBlock() {
  return (
    <section
      aria-labelledby="home-newsletter"
      className="grid grid-cols-1 gap-4 border-t-2 border-line-strong pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-10"
    >
      <div className="flex flex-col gap-2">
        <h2 id="home-newsletter" className="type-section text-strong">
          {NEWSLETTER.title}
        </h2>
        <p className="hidden type-body text-body sm:block">{NEWSLETTER.intro}</p>
      </div>
      <NewsletterForm action={subscribeNewsletterAction} />
    </section>
  );
}

/** Banco fora ou sem variáveis: estado amigável, com caminhos que não dependem do banco. */
function HomeFallback({ title, text }: { title: string; text: string }) {
  return (
    <>
      <DateStrip />
      <div className={`${CONTAINER} flex flex-col gap-10 py-10`}>
        <div className="flex max-w-read flex-col items-start gap-4">
          <h1 className="type-display text-strong">{title}</h1>
          <p className="type-body-read text-body">{text}</p>
          <div className="flex flex-wrap gap-3">
            <Button href="/" size="md">
              {HOME.retry}
            </Button>
            <Button href="/agenda" size="md" variant="outline">
              {HOME.seeAgenda}
            </Button>
          </div>
        </div>
        <NewsletterBlock />
      </div>
    </>
  );
}

function eventMeta(e: EventView): string {
  const price = e.isFree ? HOME.free : HOME.price(e.priceCents ?? 0);
  return [formatHour(e.startsAt), e.venue, price].join(" · ");
}

function Module_topics({ data }: { data: HomeData }) {
  return (
    <>
      {data.topics.length > 0 && (
        <section aria-labelledby="home-topics" className="flex flex-col gap-3">
          <SectionHeader id="home-topics" title={HOME.topics} actionHref={HOME.topicsMore} />
          <Rail label={HOME.topics} desktop="grid">
            {data.topics.map((t) => (
              <TopicSummaryCard key={t.id} topic={t} compactOnMobile className="flex-1" />
            ))}
          </Rail>
        </section>
      )}
    </>
  );
}

function Module_collections({ data }: { data: HomeData }) {
  return (
    <>
      {data.collections.length > 0 && (
        <section aria-labelledby="home-collections" className="flex flex-col gap-3">
          <SectionHeader
            id="home-collections"
            title={HOME.collections}
            actionHref={HOME.collectionsMore}
          />
          <Rail label={HOME.collections} itemWidth="sm" desktop="grid">
            {data.collections.map((c) => (
              <CollectionCard key={c.id} collection={c} compactOnMobile className="flex-1" />
            ))}
          </Rail>
        </section>
      )}
    </>
  );
}

function Module_nearby() {
  return (
    <>
      <section
        aria-labelledby="home-nearby"
        className="flex flex-col items-start gap-3 border border-line-section p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-1">
          <h2 id="home-nearby" className="type-section text-strong">
            {HOME.nearby}
          </h2>
          <p className="hidden type-body text-body sm:block">{HOME.nearbyText}</p>
        </div>
        <Button href={HOME.nearbyHref} size="md" variant="outline" icon="map-pin">
          {HOME.nearbyCta}
        </Button>
      </section>
    </>
  );
}

/** Poucos eventos próximos: menos de 3 nos próximos 14 dias. */
const NEAR_DAYS = 14;
const MIN_NEAR_EVENTS = 3;

function Module_agenda_services({ data }: { data: HomeData }) {
  const now = new Date();
  const near = data.events.filter(
    (e) => Date.parse(e.startsAt) <= now.getTime() + NEAR_DAYS * 86_400_000,
  );
  const recurring = near.length < MIN_NEAR_EVENTS ? upcomingRecurring(now, 4) : [];
  return (
    <>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
        <section aria-labelledby="home-agenda" className="flex min-w-0 flex-col gap-4">
          <SectionHeader id="home-agenda" title={HOME.agenda} actionHref={HOME.agendaMore} />
          {data.events.length > 0 && (
            <Rail label={HOME.agenda} desktop="grid">
              {data.events.map((e) => (
                <article
                  key={e.id}
                  className="relative flex w-full items-center gap-3 border border-line-section p-3 [--card-radius:var(--r-0)]"
                >
                  <EventDateBadge startsAt={e.startsAt} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="type-headline-sm line-clamp-2 text-strong">
                      <Link href={e.href} className="card-link no-underline">
                        {e.title}
                      </Link>
                    </h3>
                    <p className="type-meta text-meta">{eventMeta(e)}</p>
                  </div>
                </article>
              ))}
            </Rail>
          )}
          <RecurringDates items={recurring} id="home-agenda-recorrentes" />
        </section>

        <section aria-labelledby="home-services" className="flex min-w-0 flex-col gap-4">
          <SectionHeader id="home-services" title={HOME.services} actionHref={HOME.servicesMore} />
          <Rail label={HOME.services} itemWidth="sm" desktop="grid">
            {HOME_SERVICES.map((s) => (
              <ServiceTile
                key={s.href}
                href={s.href}
                title={s.title}
                description={s.description}
                icon={s.icon}
                compactOnMobile
                className="flex-1"
              />
            ))}
          </Rail>
        </section>
      </div>
    </>
  );
}

function Module_sections({ data }: { data: HomeData }) {
  return (
    <>
      {data.sectionBlocks.length > 0 && (
        <SectionTabs
          label={HOME.sectionsTabs}
          panels={data.sectionBlocks.map(({ section, articles }) => ({
            slug: section.slug,
            name: section.name,
            content: (
              <section
                aria-labelledby={`home-section-${section.slug}`}
                className="flex flex-col gap-4"
              >
                <SectionHeader
                  id={`home-section-${section.slug}`}
                  title={section.name}
                  actionHref={`/${section.slug}`}
                  className="border-b-2 border-line-strong pb-2"
                />
                <ul className="flex flex-col gap-4 max-lg:[&>li:nth-child(n+3)]:hidden">
                  {articles.map((a, i) => (
                    <li key={a.id}>
                      {/* Sem foto aprovada, o bloco fica tipográfico e compacto (sem capas escuras repetidas). */}
                      <ArticleCard
                        variant={i === 0 && a.image ? "standard" : "compact"}
                        article={a}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ),
          }))}
        />
      )}
    </>
  );
}

function Module_most_read({ data }: { data: HomeData }) {
  return (
    <>
      {data.mostRead.length > 0 && (
        <section aria-labelledby="home-most-read" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <CategoryTag>{HOME.mostReadTag}</CategoryTag>
            <h2 id="home-most-read" className="type-section text-strong">
              {HOME.mostRead}
            </h2>
          </div>
          <ol className="grid grid-cols-1 gap-x-10 gap-y-4 max-md:[&>li:nth-child(n+4):not([data-sponsored])]:hidden md:grid-cols-2">
            {/* Número par no desktop: a grade de duas colunas nunca fica com buraco no fim. */}
            {data.mostRead
              .slice(0, data.mostRead.length - (data.mostRead.length % 2))
              .map((a, i) => (
                <li key={a.id} className="flex min-w-0 items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="w-8 shrink-0 pt-3 font-sans text-32 font-black leading-none text-meta tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <ArticleCard variant="compact" article={a} className="min-w-0 flex-1" />
                </li>
              ))}
            {data.sponsored && (
              // Fora do corte das 3 primeiras no celular: o patrocinado nunca fica escondido.
              <li data-sponsored="" className="flex items-start gap-4 md:col-span-2">
                <ArticleCard
                  variant="compact"
                  article={data.sponsored}
                  className="min-w-0 flex-1"
                />
              </li>
            )}
          </ol>
        </section>
      )}
    </>
  );
}

function Module_sources({ data }: { data: HomeData }) {
  return (
    <>
      {data.sources.length > 0 && (
        <section aria-labelledby="home-sources" className="flex flex-col gap-3">
          <SectionHeader id="home-sources" title={HOME.sources} actionHref={HOME.sourcesMore} />
          <Rail label={HOME.sources} itemWidth="auto" className="lg:flex lg:justify-between">
            {data.sources.map((s) => (
              <SourceAvatar key={s.slug} name={s.name} image={s.logo} href={s.href} size={64} />
            ))}
          </Rail>
        </section>
      )}
    </>
  );
}

function Module_panorama({ data }: { data: HomeData }) {
  return (
    <>
      <AggregatedSection items={data.aggregated} />
    </>
  );
}

function Module_newsletter() {
  return (
    <>
      <NewsletterBlock />
    </>
  );
}

const MODULES: Record<HomeModuleId, (p: { data: HomeData }) => ReactNode> = {
  topics: Module_topics,
  collections: Module_collections,
  nearby: Module_nearby,
  agenda_services: Module_agenda_services,
  sections: Module_sections,
  most_read: Module_most_read,
  sources: Module_sources,
  panorama: Module_panorama,
  newsletter: Module_newsletter,
};

/** Módulos abaixo da primeira dobra na ordem publicada (A06); manchete e Agora são fixos. */
function Home({ data }: { data: HomeData }) {
  const { lead } = data;
  if (!lead) return <HomeFallback title={HOME.emptyTitle} text={HOME.emptyText} />;
  return (
    <>
      {data.urgent && <UrgentBar article={data.urgent} />}
      <DateStrip generatedAt={data.generatedAt} />
      <div className={`${CONTAINER} flex flex-col gap-7 py-4 lg:gap-14 lg:py-10`}>
        {/* Manchete + Agora: 100% CityNews na primeira dobra */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
          <ArticleCard variant="lead" as="h1" article={lead} className="lg:col-span-8" />
          <NowList items={data.now} className="lg:col-span-4" />
        </div>

        {/* Posição home.destaques: até 3 matérias com capa, sem repetir a manchete (R39 e R40). */}
        {data.highlights.length > 0 && (
          <section aria-labelledby="home-highlights" className="flex flex-col gap-4">
            <SectionHeader id="home-highlights" title={HOME.highlights} action={null} />
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-3 max-md:[&>li:nth-child(n+2)]:hidden">
              {data.highlights.map((a) => (
                <li key={a.id} className="flex min-w-0">
                  <ArticleCard variant="standard" article={a} className="flex-1" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.modules
          .filter((m) => m.enabled)
          .map((m) => {
            const Block = MODULES[m.id];
            return <Block key={m.id} data={data} />;
          })}
      </div>
    </>
  );
}

export default async function HomePage() {
  const result = await getHomeData(new Date(), { cache: true });
  if (result.ok) {
    return (
      <>
        <SiteJsonLd />
        <Home data={result.value} />
      </>
    );
  }
  // Banco fora sem nada no cache de dados: lançar leva à fronteira de erro (P25, 500)
  // (docs/screens.md P01, "Atualizado às hh:mm"). No build e sem variáveis, estado amigável.
  if (result.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
    throw new Error(`Home indisponível: ${result.error.message}`);
  }
  return (
    <>
      <SiteJsonLd />
      <HomeFallback title={HOME.errorTitle} text={HOME.errorText} />
    </>
  );
}
