import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { notFound } from "next/navigation";
import {
  FollowTopicButton,
  JsonLd,
  AggregatedCard,
  ArticleCard,
  Button,
  EmptyState,
  Icon,
  Timeline,
  TopicCoverage,
  TopicFaq,
} from "@/components";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { HOME } from "@/content/pt-BR/portal-home";
import { SECTION_PAGE } from "@/content/pt-BR/portal-section";
import { TOPIC } from "@/content/pt-BR/portal-topic";
import { getTopicBySlug, type TopicDetail } from "@/lib/db/queries";
import { formatWhen } from "@/lib/format/date";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";

/** Assunto: leituras em cache por 120 s (P1 Global Constraints; A-038). */
export const revalidate = 120;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG.test(slug)) return {};
  const r = await getTopicBySlug(slug);
  if (!r.ok || !r.value) return {};
  return pageMetadata({
    title: r.value.title,
    documentTitle: TOPIC.metaTitle(r.value.title),
    description: r.value.summary ?? undefined,
    path: r.value.href,
  });
}

function Topic({ t }: { t: TopicDetail }) {
  const sources = [...new Map(t.aggregated.map((a) => [a.sourceSlug, a.sourceName])).entries()].map(
    ([slug, name]) => ({ slug, name }),
  );
  return (
    <div className={`${CONTAINER} flex flex-col gap-10 py-8 lg:py-10`}>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: ARTICLE.home, path: "/" },
          { name: TOPIC.listTitle, path: "/assuntos" },
          { name: t.title, path: t.href },
        ])}
      />
      <header className="flex max-w-read flex-col gap-4">
        <p className="type-eyebrow text-eyebrow">{TOPIC.eyebrow}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="type-meta text-meta">
            {TOPIC.counts(t.articleCount, t.sourceCount)} · {TOPIC.updated(formatWhen(t.updatedAt))}
          </p>
        </div>
        <h1 className="type-display text-balance text-strong">{t.title}</h1>
        <div>
          <FollowTopicButton slug={t.slug} title={t.title} />
        </div>
        {t.summary && (
          <section
            aria-labelledby="resumo-assunto"
            className="flex flex-col gap-2 border-l-2 border-ai bg-ia-soft px-5 py-4"
          >
            <h2 id="resumo-assunto" className="type-eyebrow text-ai">
              {TOPIC.summaryTitle}
            </h2>
            <p className="type-body-read text-strong">{t.summary}</p>
          </section>
        )}
      </header>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)] lg:gap-14">
        <TopicCoverage sources={sources} className="min-w-0">
          {t.articles.length > 0 && (
            <section
              data-group="citynews"
              aria-labelledby="do-citynews"
              className="flex flex-col gap-4"
            >
              <h2 id="do-citynews" className="type-section text-strong">
                {TOPIC.fromCityNews}
              </h2>
              <ol className="flex flex-col">
                {t.articles.map((a) => (
                  <li key={a.id}>
                    <ArticleCard variant="list" article={a} />
                  </li>
                ))}
              </ol>
            </section>
          )}
          {t.aggregated.length > 0 && (
            <section
              data-group="external"
              aria-labelledby="outros-veiculos"
              className="flex flex-col gap-4 bg-aggregated p-5 lg:p-6"
            >
              <div className="flex flex-col gap-1.5">
                <h2 id="outros-veiculos" className="type-section text-strong">
                  {TOPIC.external}
                </h2>
                <p className="flex items-start gap-1.5 type-meta text-meta">
                  <Icon name="external-link" size={16} className="mt-px shrink-0" />
                  {TOPIC.externalNotice}
                </p>
              </div>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {t.aggregated.map((item) => (
                  <li key={item.id} data-source={item.sourceSlug} className="flex min-w-0">
                    <AggregatedCard item={item} surface="white" className="min-w-0 flex-1" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TopicCoverage>

        <aside className="flex flex-col gap-8">
          <Timeline entries={t.timeline} />
          <TopicFaq items={t.faq} />
        </aside>
      </div>
    </div>
  );
}

export default async function TopicRoute({ params }: Props) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const result = await getTopicBySlug(slug);
  if (!result.ok) {
    if (result.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
      throw new Error(`Assunto indisponível: ${result.error.message}`);
    }
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone="error"
          title={TOPIC.errorTitle}
          actions={
            <>
              <Button href="/assuntos" size="md">
                {HOME.topics}
              </Button>
              <Button href="/" size="md" variant="outline">
                {SECTION_PAGE.backHome}
              </Button>
            </>
          }
        >
          <p>{ARTICLE.errorText}</p>
        </EmptyState>
      </div>
    );
  }
  if (!result.value) notFound();
  return <Topic t={result.value} />;
}
