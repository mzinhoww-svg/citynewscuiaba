import Link from "next/link";
import type { ReactNode } from "react";
import { DOC_TEXT, PENDING, RELATED_LINKS, type DocSection } from "@/content/pt-BR/institutional";

export interface DocPageProps {
  title: string;
  intro: string;
  sections?: readonly DocSection[];
  /** Conteúdo extra depois das seções (tabelas, listas, formulários). */
  children?: ReactNode;
  /** Caminho atual, para não repetir o próprio link em "Veja também". */
  path: string;
}

function hasPending(sections: readonly DocSection[]): boolean {
  return sections.some((s) =>
    [...(s.paragraphs ?? []), ...(s.items ?? [])].some((t) => t.includes(PENDING)),
  );
}

/** `[PREENCHER]` destacado em texto e com fundo de atenção (dado pendente, B-001). */
function Text({ value }: { value: string }) {
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
 * Página institucional (P24): título, introdução, seções em texto corrido com medida de leitura
 * e links relacionados. Dados pendentes aparecem marcados como `[PREENCHER]`.
 *
 * ```tsx
 * <DocPage title={ABOUT.title} intro={ABOUT.intro} sections={ABOUT.sections} path="/sobre" />
 * ```
 */
export function DocPage({ title, intro, sections = [], children, path }: DocPageProps) {
  const related = RELATED_LINKS.filter((l) => l.href !== path);
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-8 px-gutter py-8 lg:py-12">
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
      <header className="flex max-w-read flex-col gap-3 border-b-2 border-line-strong pb-6">
        <h1 className="type-display text-balance text-strong">{title}</h1>
        <p className="type-body-read text-body">{intro}</p>
        <p className="type-meta text-meta">{DOC_TEXT.updated}</p>
      </header>
      {sections.length > 0 && (
        <div className="flex max-w-read flex-col gap-8">
          {sections.map((s) => (
            <section key={s.title} className="flex flex-col gap-3">
              <h2 className="type-section text-strong">{s.title}</h2>
              {s.paragraphs?.map((p) => (
                <p key={p} className="type-body-read text-pretty text-body">
                  <Text value={p} />
                </p>
              ))}
              {s.items && (
                <ul className="flex list-disc flex-col gap-2 pl-6 type-body-read text-body marker:text-meta">
                  {s.items.map((it) => (
                    <li key={it}>
                      <Text value={it} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {hasPending(sections) && <p className="type-meta text-meta">{DOC_TEXT.pendingNote}</p>}
        </div>
      )}
      {children}
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
                className="inline-flex min-h-tap items-center rounded-pill bg-section px-4 text-14 font-medium text-strong no-underline hover:bg-nevoa-2"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
