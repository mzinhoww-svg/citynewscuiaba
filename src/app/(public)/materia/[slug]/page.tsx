import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import Link from "next/link";
import { Fragment, Suspense } from "react";

import { headers } from "next/headers";
import { notFound, redirect, RedirectType } from "next/navigation";
import {
  AdSlot,
  AiSummaryBlock,
  ArticleActions,
  ArticleCard,
  ArticleFigure,
  Button,
  CategoryTag,
  CorrectionNote,
  CreditLine,
  EmptyState,
  FirstVisitGate,
  GoneState,
  JsonLd,
  MadeHow,
  ReadingProgress,
  ReadTracker,
  ReportProblemForm,
  ReviewBanner,
  SourcesList,
  UpdateNote,
  UpdatedWhileReading,
  NotificationInviteSlot,
  TagLink,
} from "@/components";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { CARD } from "@/content/pt-BR/portal-card";
import { SECTION_PAGE } from "@/content/pt-BR/portal-section";
import { SITE } from "@/content/pt-BR/site";
import { SYSTEM } from "@/content/pt-BR/system";
import { getArticleBySlug, type ArticleView } from "@/lib/db/queries";
import { findRedirect } from "@/lib/db/queries/redirects";
import { formatDateTime } from "@/lib/format/date";
import { proxyGoneHint } from "@/lib/http/gone";
import { withInlineFigure } from "@/lib/media/inline-figure";
import { publicLabels } from "@/lib/labels";
import { articleJsonLd, breadcrumbJsonLd, ldScript } from "@/lib/seo/jsonld";
import { withDirectImage } from "@/lib/db/media-direct";
import { reportProblemAction } from "./actions";

/** Matéria: leituras em cache por 300 s com a tag `article:<id>` (architecture §8; A-038). */
export const revalidate = 300;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ slug: string }> };

/**
 * Uma leitura por requisição (UX-W5-T2): `getArticleBySlug` é memorizada com `cache()`, e a
 * checagem de "removida" que o proxy já fez chega pelo cabeçalho dele (`proxyGoneHint`).
 */
async function load(slug: string) {
  if (!SLUG.test(slug) || slug.length > 200) return null;
  return getArticleBySlug(slug, { cache: true, gone: proxyGoneHint(await headers()) });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const r = await load(slug);
  if (r?.ok && r.value && "gone" in r.value) {
    return { title: SYSTEM.goneMeta, robots: { index: false, follow: true } };
  }
  if (!r?.ok || !r.value || "gone" in r.value) return { title: SITE.name };
  const a = r.value;
  return pageMetadata({
    title: a.seoTitle ?? a.title,
    description: a.seoDescription ?? a.dek,
    path: a.href,
    type: "article",
    publishedTime: a.publishedAt,
    modifiedTime: a.updatedAt,
    section: a.section.name,
    images: a.image ? [a.image.src] : undefined,
  });
}

/** Primeira frase do lide em negrito (DESIGN.md §4). */
function Lead({ text }: { text: string }) {
  const m = /^(.+?[.!?])(\s+[\s\S]*)?$/.exec(text);
  if (!m) return <p className="font-semibold">{text}</p>;
  return (
    <p>
      <strong className="font-semibold">{m[1]}</strong>
      {m[2]}
    </p>
  );
}

function Byline({ a }: { a: ArticleView }) {
  const updated = a.updatedAt !== a.publishedAt && a.status === "updated";
  const pub = publicLabels(a);
  const origin = [pub.originText, pub.sponsoredText].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-1 type-meta text-meta">
      <p className="font-semibold text-strong">{CARD.by(a.byline)}</p>
      {origin && <p>{origin}</p>}
      <p className="flex flex-wrap gap-x-1.5">
        <span>
          {ARTICLE.published}{" "}
          <time dateTime={a.publishedAt} className="tabular-nums">
            {formatDateTime(a.publishedAt)}
          </time>
        </span>
        {updated && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {ARTICLE.updated}{" "}
              <time dateTime={a.updatedAt} className="tabular-nums">
                {formatDateTime(a.updatedAt)}
              </time>
            </span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{ARTICLE.readMinutes(a.readMinutes)}</span>
      </p>
    </div>
  );
}

function Article({ a }: { a: ArticleView }) {
  const historyHref = `${a.href}/historico`;
  const blocks = withInlineFigure(a.body, a.inlineImage?.position);
  // Campos de banner (ADS-T2): nunca em matéria urgente nem patrocinada; editoria proibida o
  // `AdSlot` recusa sozinho. ART-1 entra depois do 4º parágrafo (sem 4 parágrafos, não entra).
  const ads = !a.urgent && !a.sponsored;
  const art1After = blocks.filter((x) => x.b.type === "paragraph")[3]?.i;
  const questions = ARTICLE.askQuestions(a.title, a.topic?.title);
  const ld = articleJsonLd({
    slug: a.slug,
    title: a.title,
    dek: a.dek,
    publishedAt: a.publishedAt,
    updatedAt: a.updatedAt,
    byline: a.byline,
    authorIsPerson: a.authorIsPerson,
    section: a.section,
    image: a.image,
    sources: a.sources.map((s) => ({ url: s.url, title: s.title, name: s.name })),
  });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldScript(ld) }} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: ARTICLE.home, path: "/" },
          { name: a.section.name, path: `/${a.section.slug}` },
          { name: a.title, path: a.href },
        ])}
      />
      <ReadingProgress targetId="materia" />
      <ReadTracker contentId={`article:${a.id}`} targetId="materia" section={a.section.slug} />
      <UpdatedWhileReading
        endpoint={`/api/materia/${a.slug}/atualizacao`}
        updatedAt={a.updatedAt}
        historyHref={historyHref}
      />
      <div className={`${CONTAINER} py-6 lg:py-10`}>
        <nav aria-label={ARTICLE.breadcrumb} className="mb-6">
          <ol className="flex flex-wrap items-center gap-x-2 type-meta text-meta">
            <li>
              <Link href="/" className="inline-flex min-h-tap items-center hover:text-strong">
                {ARTICLE.home}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/${a.section.slug}`}
                className="inline-flex min-h-tap items-center hover:text-strong"
              >
                {a.section.name}
              </Link>
            </li>
            {a.topic && (
              <>
                <li aria-hidden="true">/</li>
                <li>
                  <Link
                    href={`/assunto/${a.topic.slug}`}
                    className="inline-flex min-h-tap items-center hover:text-strong"
                  >
                    {a.topic.title}
                  </Link>
                </li>
              </>
            )}
          </ol>
        </nav>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)] lg:gap-14">
          <article id="materia" className="flex min-w-0 flex-col gap-6">
            <header className="flex max-w-read flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <CategoryTag>{a.section.name}</CategoryTag>
              </div>
              <h1 className="type-headline-xl text-balance text-strong">{a.title}</h1>
              <p className="font-serif text-20 leading-snug text-meta">{a.dek}</p>
              <Byline a={a} />
            </header>

            {a.reviewBanner && <ReviewBanner className="max-w-read" />}

            <ArticleActions
              article={{ id: a.id, title: a.title, href: a.href, section: a.section.name }}
            />

            {a.image && <ArticleFigure image={a.image} priority className="reading-column -my-2" />}

            {a.aiSummary && <AiSummaryBlock items={a.aiSummary} className="max-w-read" />}

            {a.notes.length > 0 && (
              <div className="flex max-w-read flex-col gap-3">
                {a.notes.map((n) =>
                  n.kind === "correction" ? (
                    <CorrectionNote key={n.version} note={n} historyHref={historyHref} />
                  ) : (
                    <UpdateNote key={n.version} note={n} historyHref={historyHref} />
                  ),
                )}
              </div>
            )}

            {a.urgent && (
              <div className="max-w-read">
                <NotificationInviteSlot trigger="urgent_article" immediate />
              </div>
            )}
            <div className="reading-body flex flex-col gap-5 text-body">
              {blocks.map(({ b, i, figureAfter }) => (
                <Fragment key={i}>
                  {b.type === "credit" ? (
                    <CreditLine text={b.text} sources={b.sources} />
                  ) : b.type === "paragraph" ? (
                    i === 0 ? (
                      <Lead text={b.text} />
                    ) : (
                      <p>{b.text}</p>
                    )
                  ) : b.level === 3 ? (
                    <h3 className="type-headline-sm text-strong">{b.text}</h3>
                  ) : (
                    <h2 className="type-headline text-strong">{b.text}</h2>
                  )}
                  {figureAfter && a.inlineImage && (
                    <ArticleFigure image={a.inlineImage} className="reading-column my-2" />
                  )}
                  {ads && i === art1After && (
                    <AdSlot code="ART-1" sectionSlug={a.section.slug} className="my-2" />
                  )}
                </Fragment>
              ))}
            </div>

            <SourcesList
              sources={a.sources}
              ownReporting={a.kind === "original"}
              className="max-w-read"
            />

            <section aria-labelledby="temas" className="flex max-w-read flex-col gap-2">
              <h2 id="temas" className="type-eyebrow text-meta">
                {ARTICLE.tags}
              </h2>
              <ul className="flex flex-wrap gap-2">
                <li>
                  <TagLink href={`/${a.section.slug}`}>{a.section.name}</TagLink>
                </li>
                {a.topic && (
                  <li>
                    <TagLink
                      href={`/assunto/${a.topic.slug}`}
                      className="max-w-full whitespace-normal! py-2.5 leading-snug!"
                    >
                      {ARTICLE.topicTag(a.topic.title)}
                    </TagLink>
                  </li>
                )}
              </ul>
            </section>

            <section
              aria-labelledby="pergunte"
              className="flex max-w-read flex-col gap-3 border-t-2 border-line-strong pt-5"
            >
              <h2 id="pergunte" className="type-section text-strong">
                {ARTICLE.ask}
              </h2>
              <p className="type-meta text-meta">{ARTICLE.askIntro}</p>
              <ul className="flex flex-col gap-2">
                {questions.map((q) => (
                  <li key={q}>
                    <Link
                      href={`/pergunte?q=${encodeURIComponent(q)}`}
                      prefetch={false}
                      className="inline-flex min-h-tap items-center gap-2 rounded-lg border border-ai bg-ia-soft px-4 py-2 text-16 text-ai no-underline hover:bg-card-white"
                    >
                      {q}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            {/* Convite da primeira visita (item 63): só no fim da leitura, nunca sobre o texto. */}
            <FirstVisitGate placement="article-end" />
          </article>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-sticky-public lg:self-start">
            <MadeHow
              article={a}
              versionsHref={historyHref}
              collapsible
              report={
                <ReportProblemForm
                  contentRef={`article:${a.id}`}
                  action={reportProblemAction}
                  variant="link"
                />
              }
            />
            {ads && (
              <Suspense fallback={null}>
                <AdSlot code="RAIL-A" sectionSlug={a.section.slug} />
              </Suspense>
            )}
          </aside>
        </div>

        {/* Blocos secundários (item 87): o texto não espera os campos de banner fora dele; o
            ART-1, no meio do texto, fica fora do Suspense para não empurrar a leitura. */}
        {ads && (
          <Suspense fallback={null}>
            <AdSlot code="ART-2" sectionSlug={a.section.slug} className="mt-12" />
          </Suspense>
        )}

        {a.related.length > 0 && (
          <section
            aria-labelledby="semelhantes"
            className="mt-12 flex flex-col gap-4 border-t-2 border-line-strong pt-6"
          >
            <h2 id="semelhantes" className="type-section text-strong">
              {ARTICLE.related}
            </h2>
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {a.related.map((r) => (
                <li key={r.id} className="flex min-w-0">
                  <ArticleCard variant="compact" article={r} className="min-w-0 flex-1" />
                </li>
              ))}
            </ul>
          </section>
        )}
        {ads && (
          <Suspense fallback={null}>
            <AdSlot code="STICKY" sectionSlug={a.section.slug} />
          </Suspense>
        )}
      </div>
    </>
  );
}

export default async function ArticleRoute({ params }: Props) {
  const { slug } = await params;
  const result = await load(slug);
  if (!result) notFound();
  if (!result.ok) {
    // Banco fora numa revalidação: lançar mantém a última versão boa no cache (A-032).
    if (result.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
      throw new Error(`Matéria indisponível: ${result.error.message}`);
    }
    return (
      <div className={`${CONTAINER} py-10`}>
        <EmptyState
          as="h1"
          tone="error"
          title={ARTICLE.errorTitle}
          actions={
            <Button href="/" size="md" variant="outline">
              {SECTION_PAGE.backHome}
            </Button>
          }
        >
          <p>{ARTICLE.errorText}</p>
        </EmptyState>
      </div>
    );
  }
  if (!result.value || "gone" in result.value) {
    // Endereço antigo com redirecionamento cadastrado (A08) vai para o destino.
    const r = await findRedirect(`/materia/${slug}`);
    if (r) redirect(r.toPath, r.kind === 301 ? RedirectType.replace : RedirectType.push);
  }
  if (!result.value) notFound();
  // O status 410 vem do proxy (src/proxy.ts); a página mostra o motivo (P25, Review Focus 2).
  if ("gone" in result.value) return <GoneState reason={result.value.reason} />;
  // Capa com URL direta do Storage (LCP sem o redirecionamento da rota, item 79).
  const a = result.value;
  return <Article a={a.image ? { ...a, image: await withDirectImage(a.image) } : a} />;
}
