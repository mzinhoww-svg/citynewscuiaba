import type { Metadata } from "next";
import { ArticleCard, Button, CategoryTag, EmptyState } from "@/components";
import { GUIDE } from "@/content/pt-BR/guide";
import { listSection } from "@/lib/db/queries";
import { firstParam, type SearchParamsInput } from "@/lib/filters/section";
import { pageMetadata } from "@/lib/seo/metadata";

/**
 * Matérias do Guia (a editoria `guia-cuiaba`): `/guia-cuiaba` virou o índice de listas (R4) e as
 * reportagens continuam aqui. Lista simples com "ver mais"; a página vive na URL (`?page=`).
 */
export const revalidate = 60;

export const metadata: Metadata = pageMetadata({
  title: GUIDE.articles.title,
  documentTitle: GUIDE.articles.metaTitle,
  description: GUIDE.articles.metaDescription,
  path: "/guia-cuiaba/materias",
});

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

type Props = { searchParams: Promise<SearchParamsInput> };

export default async function GuideArticlesPage({ searchParams }: Props) {
  const raw = Number(firstParam(await searchParams, "page"));
  const page = Number.isInteger(raw) && raw >= 1 && raw <= 50 ? raw : 1;
  const result = await listSection("guia-cuiaba", {}, page);
  const T = GUIDE.articles;
  const data = result.ok ? result.value : null;

  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <header className="flex flex-col gap-3 border-b border-line-strong pb-5">
        <CategoryTag tone="service">Guia</CategoryTag>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="max-w-read type-body text-body">{T.intro}</p>
        <p>
          <Button href="/guia-cuiaba" variant="outline" size="md" icon="map-pin">
            {GUIDE.index.title}
          </Button>
        </p>
      </header>
      {!result.ok ? (
        <EmptyState
          tone="error"
          title={T.errorTitle}
          actions={
            <Button href="/guia-cuiaba/materias" size="md">
              {GUIDE.index.retry}
            </Button>
          }
        >
          <p>{GUIDE.index.errorText}</p>
        </EmptyState>
      ) : !data || data.articles.length === 0 ? (
        <EmptyState
          title={T.emptyTitle}
          actions={
            <Button href="/guia-cuiaba" size="md">
              {GUIDE.nav.back}
            </Button>
          }
        >
          <p>{T.emptyText}</p>
        </EmptyState>
      ) : (
        <>
          <ol className="grid grid-cols-1 gap-x-8 gap-y-8 md:grid-cols-2">
            {data.articles.map((a, i) => (
              <li key={a.id} className={i === 0 ? "md:col-span-2" : undefined}>
                <ArticleCard variant={i === 0 ? "lead" : "standard"} article={a} />
              </li>
            ))}
          </ol>
          {data.hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                href={`/guia-cuiaba/materias?page=${data.page + 1}`}
                size="md"
                variant="outline"
              >
                {T.more}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
