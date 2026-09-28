import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AiSummaryBlock,
  ArticleCard,
  Button,
  CategoryTag,
  ConfidenceMeter,
  CorrectionNote,
  EmptyState,
  GoneState,
  JsonLd,
  MadeHow,
  OriginLabel,
  Photo,
  ReadingProgress,
  ReadingSettings,
  ReadTracker,
  ReportProblemForm,
  SaveButton,
  ShareSheet,
  SourcesList,
  TopicStatus,
  UpdateNote,
  UpdatedWhileReading,
} from "@/components";
import { ARTICLE, CARD, SECTION_PAGE } from "@/content/pt-BR/portal";
import { SITE } from "@/content/pt-BR/site";
import { SYSTEM } from "@/content/pt-BR/system";
import { getArticleBySlug, type ArticleView } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/format/date";
import { articleJsonLd, breadcrumbJsonLd, ldScript } from "@/lib/seo/jsonld";
import { reportProblemAction } from "./actions";

/** Matéria: leituras em cache por 300 s com a tag `article:<id>` (architecture §8; A-038). */
export const revalidate = 300;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!SLUG.test(slug) || slug.length > 200) return null;
  return getArticleBySlug(slug, { cache: true });
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
  return (
    <div className="flex flex-col gap-1 type-meta text-meta">
      <p className="font-semibold text-strong">{CARD.by(a.byline)}</p>
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
        {a.sources.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{ARTICLE.sources(new Set(a.sources.map((s) => s.sourceSlug)).size)}</span>
          </>
        )}
      </p>
    </div>
  );
}

function Article({ a }: { a: ArticleView }) {
  const historyHref = `${a.href}/historico`;
  const [first, ...rest] = a.body;
  const imageLabel = a.labels.shown
    .concat(a.labels.hidden)
    .find((l) => l.kind.startsWith("image_"));
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
                {a.topic && <TopicStatus state={a.topic.state} />}
              </div>
              <ul aria-label={CARD.origin} className="flex flex-wrap items-center gap-1.5">
                {a.labels.shown.map((l) => (
                  <li key={`${l.kind}-${l.detail ?? ""}`} className="max-w-full">
                    <OriginLabel label={l} />
                  </li>
                ))}
              </ul>
              <h1 className="type-headline-xl text-balance text-strong">{a.title}</h1>
              <p className="font-serif text-20 leading-snug text-meta">{a.dek}</p>
              <ConfidenceMeter level={a.confidence.level} />
              <Byline a={a} />
              <div
                role="group"
                aria-label={ARTICLE.actions}
                className="flex flex-wrap gap-2 border-y border-line-subtle py-3"
              >
                <SaveButton
                  contentRef={`article:${a.id}`}
                  title={a.title}
                  href={a.href}
                  section={a.section.name}
                  targetId="materia"
                />
                <ShareSheet title={a.title} url={a.href} />
                <ReadingSettings />
                <ReportProblemForm contentRef={`article:${a.id}`} action={reportProblemAction} />
              </div>
            </header>

            {a.aiSummary && (
              <AiSummaryBlock items={a.aiSummary} reviewer={a.reviewer} className="max-w-read" />
            )}

            {a.image && (
              <figure className="flex flex-col gap-2">
                <Photo
                  src={a.image.src}
                  alt={a.image.alt}
                  ratio="16/9"
                  radius="0"
                  priority
                  sizes="(min-width: 64em) 60vw, 100vw"
                  className="w-full"
                />
                <figcaption className="flex flex-wrap items-center gap-2 type-meta text-meta">
                  {imageLabel && <OriginLabel label={imageLabel} />}
                  {a.image.credit && <span>{ARTICLE.imageCredit(a.image.credit)}</span>}
                </figcaption>
              </figure>
            )}

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

            <div className="reading-body flex flex-col gap-5 text-body">
              {first &&
                (first.type === "paragraph" ? (
                  <Lead text={first.text} />
                ) : (
                  <h2 className="type-headline text-strong">{first.text}</h2>
                ))}
              {rest.map((b, i) =>
                b.type === "paragraph" ? (
                  <p key={i}>{b.text}</p>
                ) : b.level === 3 ? (
                  <h3 key={i} className="type-headline-sm text-strong">
                    {b.text}
                  </h3>
                ) : (
                  <h2 key={i} className="type-headline text-strong">
                    {b.text}
                  </h2>
                ),
              )}
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
                  <Link
                    href={`/${a.section.slug}`}
                    className="inline-flex min-h-tap items-center rounded-pill bg-section px-4 text-14 text-strong no-underline hover:bg-nevoa-2"
                  >
                    {a.section.name}
                  </Link>
                </li>
                {a.topic && (
                  <li>
                    <Link
                      href={`/assunto/${a.topic.slug}`}
                      className="inline-flex min-h-tap items-center rounded-pill bg-section px-4 text-14 text-strong no-underline hover:bg-nevoa-2"
                    >
                      {ARTICLE.topicTag(a.topic.title)}
                    </Link>
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
          </article>

          <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
            <MadeHow
              labels={a.labels}
              reviewer={a.reviewer}
              agentVersion={a.agentId ?? undefined}
              versionsHref={historyHref}
            />
          </aside>
        </div>

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
  if (!result.value) notFound();
  // O status 410 vem do proxy (src/proxy.ts); a página mostra o motivo (P25, Review Focus 2).
  if ("gone" in result.value) return <GoneState reason={result.value.reason} />;
  return <Article a={result.value} />;
}
