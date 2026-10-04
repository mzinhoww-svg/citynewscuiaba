import Link from "next/link";
import type { ReactNode } from "react";
import { DOC_TEXT, PENDING, RELATED_LINKS, type DocSection } from "@/content/pt-BR/institutional";
import { PAGE_CONTAINER, PageHeader } from "./PageHeader";

export interface DocPageProps {
  title: string;
  intro: string;
  sections?: readonly DocSection[];
  /** Conteúdo extra depois das seções (tabelas, listas, formulários). */
  children?: ReactNode;
  /** Caminho atual, para não repetir o próprio link em "Veja também". */
  path: string;
}

/** A partir de quantas seções o índice "Nesta página" ajuda mais do que atrapalha. */
const TOC_MIN = 3;

function hasPending(sections: readonly DocSection[]): boolean {
  return sections.some((s) =>
    [...(s.paragraphs ?? []), ...(s.items ?? [])].some((t) => t.includes(PENDING)),
  );
}

/** Âncora estável da seção: sem acento, minúscula, com hífens. */
function anchor(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `secao-${slug || "texto"}`;
}

/** `[PREENCHER]` destacado em texto e com fundo de atenção (dado pendente, B-001). */
export function PendingText({ value }: { value: string }) {
  const parts = value.split(PENDING);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && (
            <mark className="bg-atencao-soft px-1 font-semibold text-strong">{PENDING}</mark>
          )}
        </span>
      ))}
    </>
  );
}

/**
 * Página institucional e legal (P24, UI-T14): o mesmo contêiner e título de tela do portal,
 * texto corrido em coluna de leitura de 68ch e, com 3 seções ou mais, o índice "Nesta página"
 * (trilho de atalhos no celular, coluna lateral fixa a partir de 1024 px). O conteúdo jurídico
 * vem de `institutional.ts` e não muda aqui; dados pendentes aparecem marcados `[PREENCHER]`.
 *
 * ```tsx
 * <DocPage title={TERMS.title} intro={TERMS.intro} sections={TERMS.sections} path="/termos" />
 * ```
 */
export function DocPage({ title, intro, sections = [], children, path }: DocPageProps) {
  const toc = sections.length >= TOC_MIN;
  return (
    <div className={`${PAGE_CONTAINER} flex flex-col gap-6 py-8 lg:py-10`}>
      <DocBreadcrumb title={title} />
      <PageHeader title={title} intro={<p>{intro}</p>} meta={<p>{DOC_TEXT.updated}</p>} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-x-6">
        {toc && (
          <nav
            aria-label={DOC_TEXT.onThisPage}
            className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-6 lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:self-start"
          >
            <h2 className="type-eyebrow text-meta">{DOC_TEXT.onThisPage}</h2>
            <ol className="-mx-gutter flex snap-x gap-2 overflow-x-auto px-gutter py-1 scrollbar-none lg:mx-0 lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0">
              {sections.map((s) => (
                <li key={s.title} className="snap-start lg:border-b lg:border-line-subtle">
                  <a
                    href={`#${anchor(s.title)}`}
                    className="inline-flex min-h-tap items-center whitespace-nowrap rounded-pill bg-section px-4 text-14 font-medium text-strong no-underline hover:bg-hover lg:flex lg:whitespace-normal lg:rounded-none lg:bg-transparent lg:px-0 lg:py-2 lg:hover:bg-transparent lg:hover:text-link"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div
          data-testid="doc-body"
          className="flex min-w-0 max-w-read flex-col gap-8 lg:col-span-8 lg:row-start-1"
        >
          {sections.map((s) => (
            <section
              key={s.title}
              aria-labelledby={anchor(s.title)}
              className="flex flex-col gap-3"
            >
              <h2 id={anchor(s.title)} className="type-section text-strong">
                {s.title}
              </h2>
              {s.paragraphs?.map((p) => (
                <p key={p} className="type-body-read text-pretty text-body">
                  <PendingText value={p} />
                </p>
              ))}
              {s.items && (
                <ul className="flex list-disc flex-col gap-2 pl-6 type-body-read text-body marker:text-meta">
                  {s.items.map((it) => (
                    <li key={it}>
                      <PendingText value={it} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {hasPending(sections) && <p className="type-meta text-meta">{DOC_TEXT.pendingNote}</p>}
          {children}
          <DocRelated path={path} />
        </div>
      </div>
    </div>
  );
}

/** Trilha "Início / página" das páginas institucionais. */
export function DocBreadcrumb({ title }: { title: string }) {
  return (
    <nav aria-label={DOC_TEXT.breadcrumb}>
      <ol className="flex flex-wrap items-center gap-x-2 type-meta text-meta">
        <li>
          <Link href="/" className="inline-flex min-h-tap items-center hover:text-strong">
            {DOC_TEXT.home}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page">{title}</li>
      </ol>
    </nav>
  );
}

/** "Veja também": links institucionais, sem repetir a página atual. */
export function DocRelated({ path }: { path: string }) {
  const related = RELATED_LINKS.filter((l) => l.href !== path);
  return (
    <nav
      aria-label={DOC_TEXT.related}
      className="flex flex-col gap-3 border-t border-line-subtle pt-6"
    >
      <h2 className="type-eyebrow text-meta">{DOC_TEXT.related}</h2>
      <ul className="flex flex-wrap gap-2">
        {related.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="inline-flex min-h-tap items-center rounded-pill bg-section px-4 text-14 font-medium text-strong no-underline hover:bg-hover"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
