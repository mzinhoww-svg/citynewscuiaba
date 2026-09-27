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
  SectionHeader,
  ServiceTile,
  SourceAvatar,
  TopicSummaryCard,
  UrgentBar,
} from "@/components";
import { HOME, HOME_SERVICES, NEWSLETTER } from "@/content/pt-BR/portal";
import { getHomeData, type EventView, type HomeData } from "@/lib/db/queries";
import { formatHour, formatLongDate } from "@/lib/format/date";
import { subscribeNewsletterAction } from "./actions";

/** ISR da home: 60 s (P1 Global Constraints; architecture §8). */
export const revalidate = 60;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

function DateStrip({ generatedAt }: { generatedAt?: string }) {
  const iso = generatedAt ?? new Date().toISOString();
  return (
    <div className="bg-section">
      <p className={`${CONTAINER} flex flex-wrap justify-between gap-x-4 py-2 type-meta text-meta`}>
        <span>
          {HOME.place} · {formatLongDate(iso)}
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
        <p className="type-body text-body">{NEWSLETTER.intro}</p>
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

function Home({ data }: { data: HomeData }) {
  const { lead } = data;
  if (!lead) return <HomeFallback title={HOME.emptyTitle} text={HOME.emptyText} />;
  return (
    <>
      {data.urgent && <UrgentBar article={data.urgent} />}
      <DateStrip generatedAt={data.generatedAt} />
      <div className={`${CONTAINER} flex flex-col gap-12 py-8 lg:gap-14 lg:py-10`}>
        {/* Manchete + Agora: 100% CityNews na primeira dobra */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)] lg:gap-10">
          <ArticleCard variant="lead" as="h1" article={lead} />
          <NowList items={data.now} />
        </div>

        {data.topics.length > 0 && (
          <section aria-labelledby="home-topics" className="flex flex-col gap-5">
            <SectionHeader id="home-topics" title={HOME.topics} actionHref={HOME.topicsMore} />
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {data.topics.map((t) => (
                <li key={t.id} className="flex">
                  <TopicSummaryCard topic={t} className="flex-1" />
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.collections.length > 0 && (
          <section aria-labelledby="home-collections" className="flex flex-col gap-5">
            <SectionHeader
              id="home-collections"
              title={HOME.collections}
              actionHref={HOME.collectionsMore}
            />
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.collections.map((c) => (
                <li key={c.id} className="flex">
                  <CollectionCard collection={c} className="flex-1" />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section
          aria-labelledby="home-nearby"
          className="flex flex-col items-start gap-3 border border-line-section p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <h2 id="home-nearby" className="type-section text-strong">
              {HOME.nearby}
            </h2>
            <p className="type-body text-body">{HOME.nearbyText}</p>
          </div>
          <Button href={HOME.nearbyHref} size="md" variant="outline" icon="map-pin">
            {HOME.nearbyCta}
          </Button>
        </section>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-10">
          <section aria-labelledby="home-agenda" className="flex flex-col gap-4">
            <SectionHeader id="home-agenda" title={HOME.agenda} actionHref={HOME.agendaMore} />
            {data.events.length === 0 ? (
              <p className="type-body text-meta">{HOME.agendaEmpty}</p>
            ) : (
              <ol className="flex flex-col">
                {data.events.map((e) => (
                  <li
                    key={e.id}
                    className="relative flex items-center gap-4 border-t border-line-subtle py-3 [--card-radius:var(--r-0)]"
                  >
                    <EventDateBadge startsAt={e.startsAt} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <h3 className="type-headline-sm text-strong">
                        <Link href={e.href} className="card-link no-underline">
                          {e.title}
                        </Link>
                      </h3>
                      <p className="type-meta text-meta">{eventMeta(e)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section aria-labelledby="home-services" className="flex flex-col gap-4">
            <SectionHeader
              id="home-services"
              title={HOME.services}
              actionHref={HOME.servicesMore}
            />
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {HOME_SERVICES.map((s) => (
                <li key={s.href} className="flex">
                  <ServiceTile
                    href={s.href}
                    title={s.title}
                    description={s.description}
                    icon={s.icon}
                    className="flex-1"
                  />
                </li>
              ))}
            </ul>
          </section>
        </div>

        {data.sectionBlocks.length > 0 && (
          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {data.sectionBlocks.map(({ section, articles }) => (
              <section
                key={section.slug}
                aria-labelledby={`home-section-${section.slug}`}
                className="flex flex-col gap-4"
              >
                <SectionHeader
                  id={`home-section-${section.slug}`}
                  title={section.name}
                  actionHref={`/${section.slug}`}
                  className="border-b-2 border-line-strong pb-2"
                />
                <ul className="flex flex-col gap-4">
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
            ))}
          </div>
        )}

        {data.mostRead.length > 0 && (
          <section aria-labelledby="home-most-read" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <CategoryTag>{HOME.mostReadTag}</CategoryTag>
              <h2 id="home-most-read" className="type-section text-strong">
                {HOME.mostRead}
              </h2>
            </div>
            <ol className="grid grid-cols-1 gap-x-10 gap-y-2 md:grid-cols-2">
              {data.mostRead.map((a, i) => (
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
                <li className="flex items-start gap-4 md:col-span-2">
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

        {data.sources.length > 0 && (
          <section aria-labelledby="home-sources" className="flex flex-col gap-4">
            <SectionHeader id="home-sources" title={HOME.sources} actionHref={HOME.sourcesMore} />
            <ul className="-mx-gutter flex snap-x gap-4 overflow-x-auto px-gutter pb-2 scrollbar-none lg:mx-0 lg:justify-between lg:px-0">
              {data.sources.map((s) => (
                <li key={s.slug} className="snap-start">
                  <SourceAvatar name={s.name} href={s.href} size={64} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <AggregatedSection items={data.aggregated} />

        <NewsletterBlock />
      </div>
    </>
  );
}

export default async function HomePage() {
  const result = await getHomeData();
  if (result.ok) return <Home data={result.value} />;
  // Banco fora em uma revalidação: lançar mantém no ar a última versão boa do cache ISR
  // (docs/screens.md P01, "Atualizado às hh:mm"). No build e sem variáveis, estado amigável.
  if (result.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
    throw new Error(`Home indisponível: ${result.error.message}`);
  }
  return <HomeFallback title={HOME.errorTitle} text={HOME.errorText} />;
}
