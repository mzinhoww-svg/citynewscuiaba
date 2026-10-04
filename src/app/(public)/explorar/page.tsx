import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import {
  ArticleCard,
  Button,
  CollectionCard,
  EmptyState,
  SectionHeader,
  SectionTile,
  ServiceTile,
  TopicSummaryCard,
  TagLink,
} from "@/components";
import { EXPLORE, GUIDE_LINKS, SECTION_ICONS } from "@/content/pt-BR/explore";
import { getExploreData, type ExploreData } from "@/lib/db/queries";

/** Hub de descoberta (P07): sem personalização obrigatória. Dados em cache por 300 s. */
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: EXPLORE.title,
  documentTitle: EXPLORE.metaTitle,
  description: EXPLORE.metaDescription,
  path: "/explorar",
});

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

type Anchor = { id: string; label: string };

/** Atalhos e serviços não dependem do banco: sempre na página. */
const STATIC_ANCHORS: readonly Anchor[] = [
  { id: "atalhos", label: EXPLORE.shortcuts },
  { id: "servicos", label: EXPLORE.guide },
];

/**
 * Âncoras "Nesta página" só das seções que de fato renderizam (UX-W4-T3, item 67), na ordem
 * em que aparecem: com o banco fora, editorias, assuntos e coleções somem; sem mais lidas, ela
 * também.
 */
function anchorsFor(data: ExploreData | null): Anchor[] {
  const fromData: Anchor[] = data
    ? [
        { id: "editorias", label: EXPLORE.sections },
        { id: "assuntos", label: EXPLORE.topics },
        { id: "colecoes", label: EXPLORE.collections },
        ...(data.mostRead.length > 0 ? [{ id: "mais-lidas", label: EXPLORE.mostRead }] : []),
      ]
    : [];
  return [...fromData, ...STATIC_ANCHORS];
}

function Header({ anchors }: { anchors: readonly Anchor[] }) {
  return (
    <header className="flex flex-col gap-4 border-b border-line-strong pb-4">
      <div className="flex max-w-read flex-col gap-3">
        <h1 className="type-screen-title text-strong">{EXPLORE.title}</h1>
        <p className="type-body text-body">{EXPLORE.intro}</p>
      </div>
      <nav aria-label={EXPLORE.onThisPage}>
        <ul className="flex snap-x gap-2 overflow-x-auto py-1 scrollbar-none">
          {anchors.map((a) => (
            <li key={a.id} className="snap-start">
              <TagLink href={`#${a.id}`}>{a.label}</TagLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

/**
 * Links que não dependem do banco: aparecem mesmo com o banco fora. Cada atalho leva aonde o
 * texto diz (item 68); o Perguntar ao CityNews tem entrada própria aqui (item 66).
 */
function Shortcuts() {
  return (
    <>
      <section
        id="atalhos"
        aria-labelledby="explorar-atalhos"
        className="flex scroll-mt-32 flex-col gap-4"
      >
        <SectionHeader id="explorar-atalhos" title={EXPLORE.shortcuts} action={null} />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <li className="flex">
            <SectionTile
              href="/pergunte"
              name={EXPLORE.ask}
              meta={EXPLORE.askText}
              icon="message-circle"
              className="flex-1"
            />
          </li>
          <li className="flex">
            <SectionTile
              href="/fontes"
              name={EXPLORE.sources}
              meta={EXPLORE.sourcesText}
              icon="globe"
              className="flex-1"
            />
          </li>
          <li className="flex">
            <SectionTile
              href="/agenda"
              name={EXPLORE.agenda}
              meta={EXPLORE.agendaText}
              icon="calendar"
              className="flex-1"
            />
          </li>
          <li className="flex">
            <SectionTile
              href="/app"
              name={EXPLORE.app}
              meta={EXPLORE.appText}
              icon="download"
              className="flex-1"
            />
          </li>
        </ul>
      </section>
      <section
        id="servicos"
        aria-labelledby="explorar-servicos"
        className="flex scroll-mt-32 flex-col gap-4"
      >
        <SectionHeader
          id="explorar-servicos"
          title={EXPLORE.guide}
          actionHref={EXPLORE.guideMore}
        />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDE_LINKS.map((g) => (
            <li key={g.href} className="flex">
              <ServiceTile
                href={g.href}
                title={g.title}
                description={g.description}
                icon={g.icon}
                className="flex-1"
              />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Explore({ data }: { data: ExploreData }) {
  const withNews = data.sections.filter((s) => s.todayCount > 0);
  const quiet = data.sections.filter((s) => s.todayCount === 0);
  return (
    <>
      {/* Posição explorar.topo: pino do admin ou automático, sempre com capa aprovada. */}
      {data.featured && (
        <section aria-labelledby="explorar-topo" className="flex flex-col gap-4">
          <SectionHeader id="explorar-topo" title={EXPLORE.featured} action={null} />
          <ArticleCard variant="lead" article={data.featured} />
        </section>
      )}

      <section
        id="editorias"
        aria-labelledby="explorar-editorias"
        className="flex scroll-mt-32 flex-col gap-4"
      >
        <SectionHeader id="explorar-editorias" title={EXPLORE.sections} action={null} />
        {/* Só quem tem matéria hoje vira atalho com contagem; as demais são link simples. */}
        {withNews.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {withNews.map((s) => (
              <li key={s.slug} className="flex">
                <SectionTile
                  href={s.href}
                  name={s.name}
                  meta={EXPLORE.today(s.todayCount)}
                  icon={SECTION_ICONS[s.slug] ?? "newspaper"}
                  className="flex-1"
                />
              </li>
            ))}
          </ul>
        )}
        {quiet.length > 0 && (
          <ul aria-label={EXPLORE.otherSections} className="flex flex-wrap gap-2">
            {quiet.map((s) => (
              <li key={s.slug}>
                <TagLink href={s.href}>{s.name}</TagLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="assuntos"
        aria-labelledby="explorar-assuntos"
        className="flex scroll-mt-32 flex-col gap-4"
      >
        <SectionHeader
          id="explorar-assuntos"
          title={EXPLORE.topics}
          actionHref={EXPLORE.topicsMore}
        />
        {data.topics.length === 0 ? (
          <p className="type-body text-meta">{EXPLORE.topicsEmpty}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {data.topics.map((t) => (
              <li key={t.id} className="flex">
                <TopicSummaryCard topic={t} className="flex-1" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="colecoes"
        aria-labelledby="explorar-colecoes"
        className="flex scroll-mt-32 flex-col gap-4"
      >
        <SectionHeader id="explorar-colecoes" title={EXPLORE.collections} action={null} />
        {data.collections.length === 0 ? (
          <p className="type-body text-meta">{EXPLORE.collectionsEmpty}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.collections.map((c) => (
              <li key={c.id} className="flex">
                <CollectionCard collection={c} className="flex-1" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.mostRead.length > 0 && (
        <section
          id="mais-lidas"
          aria-labelledby="explorar-mais-lidas"
          className="flex scroll-mt-32 flex-col gap-4"
        >
          <SectionHeader id="explorar-mais-lidas" title={EXPLORE.mostRead} action={null} />
          <ol className="grid grid-cols-1 gap-x-10 gap-y-2 md:grid-cols-2">
            {data.mostRead.map((a, i) => (
              <li key={a.id} className="flex min-w-0 items-start gap-4">
                <span
                  aria-hidden="true"
                  className="w-8 shrink-0 pt-3 font-sans text-32 font-black leading-none text-meta tabular-nums"
                >
                  {i + 1}
                </span>
                <ArticleCard variant="compact" article={a} className="min-w-0 flex-1" />
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

export default async function ExploreRoute() {
  const r = await getExploreData();
  if (
    !r.ok &&
    r.error.kind === "unavailable" &&
    process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD
  ) {
    // Sem cache de dados e com o banco fora: a fronteira de erro mostra "Tentar de novo".
    throw new Error(`Explorar indisponível: ${r.error.message}`);
  }
  return (
    <div className={`${CONTAINER} flex flex-col gap-12 py-8 lg:py-10`}>
      <Header anchors={anchorsFor(r.ok ? r.value : null)} />
      {r.ok ? (
        <Explore data={r.value} />
      ) : (
        <EmptyState
          tone="error"
          title={EXPLORE.errorTitle}
          actions={
            <Button href="/explorar" size="md">
              {EXPLORE.retry}
            </Button>
          }
        >
          <p>{EXPLORE.errorText}</p>
        </EmptyState>
      )}
      <Shortcuts />
    </div>
  );
}
