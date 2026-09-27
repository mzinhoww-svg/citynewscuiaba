import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, EmptyState, VersionDiff } from "@/components";
import { ARTICLE, SECTION_PAGE } from "@/content/pt-BR/portal";
import { SITE } from "@/content/pt-BR/site";
import { getArticleHistory, type PublicVersion } from "@/lib/db/queries";
import { diffWords } from "@/lib/diff/words";
import { formatDateTime } from "@/lib/format/date";

/** Mesmo ciclo da matéria: 300 s + tag `article:<id>`. */
export const revalidate = 300;

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Props = { params: Promise<{ slug: string }> };

function plain(v: PublicVersion): string {
  return [v.title, v.dek, ...v.body.map((b) => b.text)].join("\n\n");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${ARTICLE.historyTitle} · ${SITE.name}`,
    alternates: { canonical: `/materia/${slug}/historico` },
    robots: { index: false, follow: true },
  };
}

export default async function HistoryRoute({ params }: Props) {
  const { slug } = await params;
  if (!SLUG.test(slug)) notFound();
  const result = await getArticleHistory(slug);
  if (!result.ok) {
    if (result.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
      throw new Error(`Histórico indisponível: ${result.error.message}`);
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
  const h = result.value;
  if (!h) notFound();

  return (
    <div className={`${CONTAINER} flex max-w-read flex-col gap-8 py-8 lg:py-10`}>
      <header className="flex flex-col gap-3 border-b-2 border-line-strong pb-5">
        <Link
          href={h.href}
          className="inline-flex min-h-tap items-center self-start text-14 font-semibold text-link underline underline-offset-4 hover:text-strong"
        >
          {ARTICLE.backToArticle}
        </Link>
        <p className="type-eyebrow text-eyebrow">{h.section.name}</p>
        <h1 className="type-screen-title text-strong">
          {ARTICLE.historyTitle}: {h.title}
        </h1>
        <p className="type-body text-body">{ARTICLE.historyIntro}</p>
        <p className="type-meta text-meta">{ARTICLE.historyLegend}</p>
      </header>
      {h.versions.length === 0 ? (
        <EmptyState title={ARTICLE.historyEmpty} />
      ) : (
        <ol className="flex flex-col gap-8">
          {h.versions.map((v, i) => {
            const previous = h.versions[i + 1];
            const parts = previous ? diffWords(plain(previous), plain(v)) : [];
            const changed = parts.some((p) => p.type !== "same");
            return (
              <li key={v.number} id={`v${v.number}`} className="flex flex-col gap-3 scroll-mt-6">
                <h2 className="flex flex-wrap items-baseline gap-x-2 type-section text-strong">
                  {ARTICLE.version(v.number)} · {ARTICLE.versionKind[v.kind]}
                  <time dateTime={v.at} className="type-meta text-meta">
                    {formatDateTime(v.at)}
                  </time>
                </h2>
                {v.note && <p className="type-body font-semibold text-strong">{v.note}</p>}
                {!previous ? (
                  <p className="type-body text-meta">{ARTICLE.firstVersion}</p>
                ) : changed ? (
                  <VersionDiff parts={parts} className="border-l-2 border-line-section pl-4" />
                ) : (
                  <p className="type-body text-meta">{ARTICLE.noChanges}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
