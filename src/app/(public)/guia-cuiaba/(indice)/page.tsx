import type { Metadata } from "next";
import { ArticleCard, Button, CategoryTag, EmptyState, ListCard } from "@/components";
import { GUIDE } from "@/content/pt-BR/guide";
import { listSection } from "@/lib/db/queries";
import { listGuideLists } from "@/lib/db/queries/guide";
import { pageMetadata } from "@/lib/seo/metadata";

/** Índice do Guia: listas publicadas. Dados em cache por tag (`guide`), invalidado pelo Estúdio. */
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: GUIDE.index.title,
  documentTitle: GUIDE.index.metaTitle,
  description: GUIDE.index.metaDescription,
  path: "/guia-cuiaba",
});

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

/** Matérias mostradas enquanto o Guia não tem listas (a página nunca fica só com um aviso). */
const LATEST_WHILE_EMPTY = 6;

export default async function GuideIndexPage() {
  const result = await listGuideLists();
  const T = GUIDE.index;
  const empty =
    result.ok && result.value.editorial.length === 0 && result.value.sponsored.length === 0;
  // Sem listas, a página traz as matérias recentes do Guia em vez de uma caixa "em breve".
  const latest = empty ? await listSection("guia-cuiaba", {}, 1) : null;
  const articles = latest?.ok ? (latest.value?.articles ?? []).slice(0, LATEST_WHILE_EMPTY) : [];
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <header className="flex flex-col gap-3 border-b border-line-strong pb-5">
        <CategoryTag tone="service">Guia</CategoryTag>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="max-w-read type-body text-body">{T.intro}</p>
        <p>
          <Button href="/guia-cuiaba/materias" variant="outline" size="md" icon="newspaper">
            {T.articlesLink}
          </Button>
        </p>
      </header>

      {!result.ok ? (
        <EmptyState
          tone="error"
          title={T.errorTitle}
          actions={
            <Button href="/guia-cuiaba" size="md">
              {T.retry}
            </Button>
          }
        >
          <p>{T.errorText}</p>
        </EmptyState>
      ) : empty ? (
        // Sem listas: uma linha honesta e as matérias recentes logo abaixo (antes, só uma caixa
        // "em breve" e nenhuma leitura na tela). O link do cabeçalho leva à lista completa.
        <section aria-labelledby="guia-em-breve" className="flex flex-col gap-6">
          <div className="flex max-w-read flex-col gap-2">
            <h2 id="guia-em-breve" className="type-section text-balance text-strong">
              {T.emptyTitle}
            </h2>
            <p className="type-body text-body">
              {articles.length > 0 ? T.emptyText : T.emptyNoArticles}
            </p>
          </div>
          {articles.length > 0 && (
            <ol aria-label={T.articlesLink} className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {articles.map((a) => (
                <li key={a.id}>
                  <ArticleCard variant="standard" article={a} />
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <>
          {result.value.editorial.length > 0 && (
            <section aria-labelledby="listas-do-guia" className="flex flex-col gap-2">
              <h2 id="listas-do-guia" className="type-section text-strong">
                {T.listsTitle}
              </h2>
              <ol className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                {result.value.editorial.map((l) => (
                  <li key={l.slug}>
                    <ListCard list={l} />
                  </li>
                ))}
              </ol>
            </section>
          )}
          {result.value.sponsored.length > 0 && (
            <section aria-labelledby="listas-patrocinadas" className="flex flex-col gap-2">
              <h2 id="listas-patrocinadas" className="type-section text-strong">
                {T.sponsoredTitle}
              </h2>
              <p className="type-meta text-meta">{T.sponsoredNote}</p>
              <ol className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                {result.value.sponsored.map((l) => (
                  <li key={l.slug}>
                    <ListCard list={l} />
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}
