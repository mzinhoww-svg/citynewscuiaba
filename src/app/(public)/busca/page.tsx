import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  Button,
  EmptyState,
  Icon,
  SearchBox,
  SearchFiltersBar,
  KeepFocusInView,
  SearchGroupBlock,
  Skeleton,
  TagLink,
} from "@/components";
import { SEARCH } from "@/content/pt-BR/search";
import { listTopics } from "@/lib/db/queries";
import type { SearchParamsInput } from "@/lib/filters/section";
import {
  parseSearchParams,
  queryTerms,
  SEARCH_DEFAULTS,
  SEARCH_PARAM_VALUES,
  searchHref,
  serializeSearch,
  type SearchFilters,
} from "@/lib/search";
import { searchHybrid } from "@/lib/search/server";
import { pageMetadata } from "@/lib/seo/metadata";

/**
 * Busca tradicional (P12). Resultados dependem da URL, então a página é por requisição; fica fora
 * do índice dos buscadores (robots.txt e `noindex`, A-044). Sem login.
 */
const CONTAINER = "mx-auto w-full max-w-page px-gutter";

type Props = { searchParams: Promise<SearchParamsInput> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = parseSearchParams(await searchParams);
  return pageMetadata({
    title: SEARCH.title,
    documentTitle: SEARCH.documentTitle(q),
    description: SEARCH.metaDescription,
    path: "/busca",
    noindex: true,
  });
}

/** Filtros que o campo de busca preserva ao buscar outro texto. */
function keptFilters(f: SearchFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.type !== SEARCH_DEFAULTS.type) out.tipo = SEARCH_PARAM_VALUES.type[f.type];
  if (f.origin !== SEARCH_DEFAULTS.origin) out.origem = SEARCH_PARAM_VALUES.origin[f.origin];
  if (f.section) out.editoria = f.section;
  if (f.period !== SEARCH_DEFAULTS.period) out.periodo = SEARCH_PARAM_VALUES.period[f.period];
  if (f.source) out.fonte = f.source;
  return out;
}

const askHref = (q: string) => `/pergunte?q=${encodeURIComponent(q)}`;

/** Resultados antes da linha do Pergunte no celular (UX item 76). */
const ASK_AFTER_MOBILE = 3;

/**
 * Linha que leva a mesma pergunta ao chat. No desktop, no topo dos resultados; no celular,
 * compacta e depois dos primeiros resultados (`compact`), para a busca mostrar primeiro o que
 * encontrou.
 */
function AskRow({ q, compact = false }: { q: string; compact?: boolean }) {
  return (
    <Link
      href={askHref(q)}
      prefetch={false}
      data-ask-row={compact ? "compact" : "top"}
      className={
        compact
          ? "flex min-h-tap items-center gap-3 border-y border-line-section py-2 no-underline hover:bg-section lg:hidden"
          : "hidden min-h-tap items-center gap-3 border-y border-line-section py-3 no-underline hover:bg-section lg:flex"
      }
    >
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-pill bg-ia-soft text-ai ${compact ? "size-8" : "size-10"}`}
      >
        <Icon name="message-circle" size={compact ? 16 : 20} />
      </span>
      {compact ? (
        <span className="min-w-0 flex-1 truncate type-body font-semibold text-strong">
          {SEARCH.askAi}
          <span className="sr-only">
            {" "}
            {SEARCH.askAiHint}: “{q}”
          </span>
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="type-body font-semibold text-strong">{SEARCH.askAi}</span>
          <span className="type-meta text-meta">
            {SEARCH.askAiHint}: <span className="text-strong">“{q}”</span>
          </span>
        </span>
      )}
      <Icon name="chevron-right" size={20} className="shrink-0 text-meta" />
    </Link>
  );
}

function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-6">
      <p className="sr-only">{SEARCH.loading}</p>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} lines={3} />
      ))}
    </div>
  );
}

function Empty({ filters, didYouMean }: { filters: SearchFilters; didYouMean: string | null }) {
  const filtered =
    serializeSearch({ ...SEARCH_DEFAULTS, q: filters.q }) !== serializeSearch(filters);
  return (
    <EmptyState
      title={SEARCH.emptyTitle(filters.q)}
      actions={
        <>
          {filtered && (
            <Button href={searchHref({ ...SEARCH_DEFAULTS, q: filters.q })} size="md">
              {SEARCH.emptyWiden}
            </Button>
          )}
          <Button href={askHref(filters.q)} size="md" variant={filtered ? "outline" : "primary"}>
            {SEARCH.emptyAsk}
          </Button>
          <Button href="/assuntos" size="md" variant="outline">
            {SEARCH.emptyExplore}
          </Button>
        </>
      }
    >
      {didYouMean && (
        <p className="mb-2">
          {SEARCH.didYouMean}{" "}
          <Link
            href={searchHref(filters, { q: didYouMean })}
            className="font-semibold text-link underline underline-offset-4"
          >
            {didYouMean}
          </Link>
          ?
        </p>
      )}
      <p>{SEARCH.emptyText}</p>
    </EmptyState>
  );
}

function Failure({ filters }: { filters: SearchFilters }) {
  return (
    <EmptyState
      tone="error"
      title={SEARCH.errorTitle}
      actions={
        <>
          <Button href={searchHref(filters)} size="md">
            {SEARCH.retry}
          </Button>
          <Button href={askHref(filters.q)} size="md" variant="outline">
            {SEARCH.emptyAsk}
          </Button>
        </>
      }
    >
      <p>{SEARCH.errorText}</p>
    </EmptyState>
  );
}

async function Results({ filters }: { filters: SearchFilters }) {
  return (
    <>
      <KeepFocusInView />
      <ResultsBody filters={filters} />
    </>
  );
}

async function ResultsBody({ filters }: { filters: SearchFilters }) {
  const result = await searchHybrid(filters.q, filters);
  if (!result.ok) return <Failure filters={filters} />;
  const r = result.value;
  if (r.total === 0) return <Empty filters={filters} didYouMean={r.didYouMean} />;
  const terms = queryTerms(filters.q);
  const now = new Date();
  // Celular: a linha do Pergunte entra depois dos primeiros resultados; a lista se divide em
  // duas (a segunda continua a numeração) para a linha não virar um item de resultado.
  const head = r.groups.slice(0, ASK_AFTER_MOBILE);
  const tail = r.groups.slice(ASK_AFTER_MOBILE);
  const items = (groups: typeof r.groups) =>
    groups.map((g) => (
      <li key={g.topic ? `topic:${g.topic.id}` : `${g.items[0]?.kind}:${g.items[0]?.item.id}`}>
        <SearchGroupBlock group={g} terms={terms} now={now} />
      </li>
    ));
  return (
    <section aria-labelledby="resultados-titulo" className="flex flex-col gap-2">
      <h2 id="resultados-titulo" className="type-section text-strong">
        {SEARCH.count(r.total, filters.q)}
      </h2>
      {r.semantic && <p className="type-meta text-meta">{SEARCH.semantic}</p>}
      <ol className="flex flex-col divide-y divide-line-section">{items(head)}</ol>
      <AskRow q={filters.q} compact />
      {tail.length > 0 && (
        <ol
          start={ASK_AFTER_MOBILE + 1}
          className="flex flex-col divide-y divide-line-section lg:border-t lg:border-line-section"
        >
          {items(tail)}
        </ol>
      )}
    </section>
  );
}

/** Sem consulta: explicação e assuntos em andamento como ponto de partida. */
async function Start() {
  const topics = await listTopics();
  const list = topics.ok ? topics.value.filter((t) => t.state !== "encerrado").slice(0, 6) : [];
  return (
    <section aria-labelledby="comece" className="flex flex-col gap-4">
      <h2 id="comece" className="type-section text-strong">
        {SEARCH.startTitle}
      </h2>
      <p className="max-w-read type-body text-body">{SEARCH.startText}</p>
      {list.length > 0 && (
        <>
          <h3 className="type-eyebrow text-meta">{SEARCH.startTopics}</h3>
          <ul className="flex flex-wrap gap-2">
            {list.map((t) => (
              <li key={t.id}>
                <TagLink
                  href={t.href}
                  className="max-w-full whitespace-normal! py-2.5 leading-snug!"
                >
                  {t.title}
                </TagLink>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default async function SearchPage({ searchParams }: Props) {
  const filters = parseSearchParams(await searchParams);
  return (
    <div className={`${CONTAINER} flex flex-col gap-6 py-8 lg:py-10`}>
      <header className="flex max-w-read flex-col gap-3">
        <h1 className="type-screen-title text-strong">{SEARCH.title}</h1>
        <SearchBox key={filters.q} defaultValue={filters.q} hidden={keptFilters(filters)} />
      </header>
      {filters.q ? (
        <>
          <AskRow q={filters.q} />
          <SearchFiltersBar filters={filters} />
          <Suspense key={serializeSearch(filters)} fallback={<Loading />}>
            <Results filters={filters} />
          </Suspense>
        </>
      ) : (
        <Suspense fallback={<Loading />}>
          <Start />
        </Suspense>
      )}
    </div>
  );
}
