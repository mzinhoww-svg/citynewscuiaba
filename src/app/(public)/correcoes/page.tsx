import type { Metadata } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import Link from "next/link";
import { Button, DocPage, EmptyState } from "@/components";
import { CORRECTIONS_PAGE as C } from "@/content/pt-BR/institutional";
import { listCorrections } from "@/lib/db/queries";
import { formatDateTime } from "@/lib/format/date";

/** Correções públicas (P24): dados em cache por 300 s (tag `corrections`). */
export const revalidate = 300;

export const metadata: Metadata = {
  title: C.metaTitle,
  description: C.description,
  alternates: { canonical: C.path },
};

async function List() {
  const r = await listCorrections();
  if (!r.ok) {
    if (r.error.kind === "unavailable" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
      throw new Error(`Correções indisponíveis: ${r.error.message}`);
    }
    return (
      <EmptyState
        tone="error"
        title={C.errorTitle}
        actions={
          <Button href={C.path} size="md">
            {C.retry}
          </Button>
        }
      >
        <p>{C.errorText}</p>
      </EmptyState>
    );
  }
  if (r.value.length === 0) {
    return (
      <EmptyState title={C.empty}>
        <p>{C.emptyText}</p>
      </EmptyState>
    );
  }
  return (
    <ol aria-label={C.listLabel} className="flex max-w-read flex-col">
      {r.value.map((c) => (
        <li key={c.id} className="flex flex-col gap-2 border-t border-line-subtle py-5">
          <p className="flex flex-wrap gap-x-1.5 type-meta text-meta">
            <span className="font-semibold text-strong">{C.kinds[c.kind]}</span>
            <span aria-hidden="true">·</span>
            <span>
              {C.published}{" "}
              <time dateTime={c.publishedAt} className="tabular-nums">
                {formatDateTime(c.publishedAt)}
              </time>
            </span>
          </p>
          <p className="type-body-read text-body">{c.note}</p>
          {c.article ? (
            <Link
              href={c.article.href}
              className="inline-flex min-h-tap items-center self-start text-16 font-semibold text-link underline underline-offset-4 hover:text-strong"
            >
              {C.readArticle(c.article.title)}
            </Link>
          ) : (
            <p className="type-meta text-meta">{C.articleGone}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function CorrectionsPage() {
  return (
    <DocPage title={C.title} intro={C.intro} path={C.path}>
      <List />
      <p className="max-w-read type-body text-body">
        {C.report}{" "}
        <Link
          href="/direito-de-resposta"
          className="font-semibold text-link underline underline-offset-4 hover:text-strong"
        >
          {C.replyLink}
        </Link>
      </p>
    </DocPage>
  );
}
