import type { Metadata } from "next";
import Link from "next/link";
import { Button, Chip, CoverageCompare, EmptyState, Icon } from "@/components";
import { PANORAMA_TEXT as T } from "@/content/pt-BR/sources";
import { getSourceSignals, getTopicBySlug, listAggregated, listTopics } from "@/lib/db/queries";
import { pageMetadata } from "@/lib/seo/metadata";
import { buildCoverage, pickActiveTopic } from "@/lib/sources/coverage";
import { PanoramaClient } from "./PanoramaClient";

/**
 * Panorama de fontes (P16): camada secundária, toda em `--surface-aggregated`, com rótulo
 * AGREGADO em cada item e link para o original. Não compete com o conteúdo do CityNews: sem
 * imagens, sem manchete, e com link de volta para a reportagem própria.
 */
export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.metaDescription,
  path: "/panorama",
});

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PanoramaRoute({ searchParams }: Props) {
  const sp = await searchParams;
  const [items, topics, signals] = await Promise.all([
    listAggregated({ limit: 24 }),
    listTopics(),
    getSourceSignals({ window: "7d" }),
  ]);

  const header = (
    <header className="flex flex-col gap-4 border-b-2 border-line-strong pb-5">
      <div className="flex max-w-read flex-col gap-3">
        <p className="type-eyebrow text-meta">{T.eyebrow}</p>
        <h1 className="type-display text-strong">{T.title}</h1>
        <p className="type-body text-body">{T.intro}</p>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-meta">
        <span className="inline-flex items-center gap-1.5">
          <Icon name="external-link" size={16} />
          {T.notice}
        </span>
        <Link
          href="/"
          className="inline-flex min-h-tap items-center font-semibold text-link underline underline-offset-4"
        >
          {T.homeLink}
        </Link>
      </p>
    </header>
  );

  if (!items.ok) {
    const unconfigured = items.error.kind === "unconfigured";
    return (
      <div className="bg-aggregated">
        <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
          {header}
          <EmptyState
            tone={unconfigured ? "empty" : "error"}
            title={unconfigured ? T.unconfiguredTitle : T.errorTitle}
            actions={
              <Button href={unconfigured ? "/" : "/panorama"} size="md" variant="outline">
                {unconfigured ? T.homeLink : T.retry}
              </Button>
            }
          >
            <p>{unconfigured ? T.unconfiguredText : T.errorText}</p>
          </EmptyState>
        </div>
      </div>
    );
  }

  const publicTopics = topics.ok ? topics.value : [];
  const themeSlug = typeof sp.assunto === "string" ? sp.assunto : undefined;
  const theme = publicTopics.find((t) => t.slug === themeSlug);
  const active = theme && theme.sourceCount >= 1 ? theme : pickActiveTopic(publicTopics);
  const detail = active ? await getTopicBySlug(active.slug) : null;

  const sources = signals.ok
    ? signals.value.map((s) => ({ slug: s.slug, name: s.name, popularity: s.popularity }))
    : [...new Map(items.value.map((i) => [i.sourceSlug, i.sourceName])).entries()].map(
        ([slug, name]) => ({ slug, name, popularity: 0 }),
      );
  const coverage =
    detail?.ok && detail.value ? buildCoverage(detail.value.aggregated, sources) : null;
  const list = theme ? items.value.filter((i) => i.topicId === theme.id) : items.value;

  return (
    <div className="bg-aggregated">
      <div className={`${CONTAINER} flex flex-col gap-10 py-8 lg:py-10`}>
        {header}

        {publicTopics.length > 0 && (
          <nav aria-label={T.themes} className="flex flex-col gap-2">
            <p className="type-meta font-semibold text-strong">{T.themes}</p>
            <ul className="flex snap-x gap-2 overflow-x-auto py-1 scrollbar-none">
              <li className="snap-start">
                <Chip href="/panorama" active={!theme}>
                  {T.allThemes}
                </Chip>
              </li>
              {publicTopics.slice(0, 8).map((t) => (
                <li key={t.id} className="snap-start">
                  <Chip href={`/panorama?assunto=${t.slug}`} active={theme?.id === t.id}>
                    {t.title}
                  </Chip>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {coverage && detail?.ok && detail.value ? (
          <CoverageCompare
            topic={{ title: detail.value.title, href: detail.value.href }}
            citynewsCount={detail.value.articles.length}
            covered={coverage.covered}
            missing={coverage.missing}
          />
        ) : (
          <section aria-labelledby="comparar" className="flex flex-col gap-2">
            <h2 id="comparar" className="type-section text-strong">
              {T.compareTitle}
            </h2>
            <p className="type-body text-meta">{T.compareEmpty}</p>
          </section>
        )}

        <PanoramaClient items={list} sources={sources} />
      </div>
    </div>
  );
}
