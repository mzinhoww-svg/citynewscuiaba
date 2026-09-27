import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import Form from "next/form";
import { Suspense } from "react";
import { Button, Chip, EmptyState, Select, Skeleton, TopicSummaryCard } from "@/components";
import { SECTIONS } from "@/content/pt-BR/nav";
import { SECTION_PAGE, TOPIC } from "@/content/pt-BR/portal";
import { listTopics } from "@/lib/db/queries";
import type { SearchParamsInput } from "@/lib/filters/section";
import {
  TOPIC_STATE_PARAM,
  parseTopicListFilters,
  topicListHref,
  type TopicListQuery,
} from "@/lib/filters/topics";
import type { TopicState } from "@/lib/db/queries/types";

/** Lista de assuntos (P06). Filtros na URL: renderizada por requisição. */
export const revalidate = 120;

export const metadata: Metadata = pageMetadata({
  title: TOPIC.listTitle,
  documentTitle: TOPIC.listMeta,
  description: TOPIC.listIntro,
  path: "/assuntos",
});

const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const STATES: TopicState[] = ["em_apuracao", "confirmado", "corrigido", "encerrado"];

type Props = { searchParams: Promise<SearchParamsInput> };

function Filters({ f }: { f: TopicListQuery }) {
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={TOPIC.listFilters}>
        <ul className="flex snap-x gap-2 overflow-x-auto py-1 scrollbar-none">
          <li>
            <Chip
              href={topicListHref(f, { state: undefined, week: false })}
              active={!f.state && !f.week}
            >
              {TOPIC.listAll}
            </Chip>
          </li>
          {STATES.map((s) => (
            <li key={s}>
              <Chip
                href={topicListHref(f, { state: f.state === s ? undefined : s })}
                active={f.state === s}
              >
                {TOPIC.listStates[s]}
              </Chip>
            </li>
          ))}
          <li>
            <Chip href={topicListHref(f, { week: !f.week })} active={f.week}>
              {TOPIC.listWeek}
            </Chip>
          </li>
        </ul>
      </nav>
      <Form
        action="/assuntos"
        key={topicListHref(f)}
        autoComplete="off"
        className="flex flex-wrap items-end gap-3"
      >
        {f.state && <input type="hidden" name="situacao" value={TOPIC_STATE_PARAM[f.state]} />}
        {f.week && <input type="hidden" name="semana" value="1" />}
        <Select
          id="assuntos-editoria"
          name="editoria"
          label={TOPIC.listSection}
          placeholder={TOPIC.listAllSections}
          defaultValue={f.section ?? ""}
          options={SECTIONS.map((s) => ({ value: s.id, label: s.label }))}
          className="min-w-64"
        />
        <Button type="submit" size="md" variant="outline">
          {TOPIC.listApply}
        </Button>
      </Form>
    </div>
  );
}

async function Results({ f }: { f: TopicListQuery }) {
  const r = await listTopics(f);
  if (!r.ok) {
    return (
      <EmptyState
        tone="error"
        title={TOPIC.listError}
        actions={
          <Button href={topicListHref(f)} size="md">
            {SECTION_PAGE.retry}
          </Button>
        }
      >
        <p>{SECTION_PAGE.errorText}</p>
      </EmptyState>
    );
  }
  if (r.value.length === 0) {
    return (
      <EmptyState
        title={TOPIC.listEmpty}
        actions={
          <Button href="/assuntos" size="md">
            {TOPIC.listSeeAll}
          </Button>
        }
      >
        <p>{TOPIC.listEmptyText}</p>
      </EmptyState>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
      {r.value.map((t) => (
        <li key={t.id} className="flex">
          <TopicSummaryCard topic={t} as="h2" className="flex-1" />
        </li>
      ))}
    </ul>
  );
}

function Loading() {
  return (
    <div aria-busy="true" className="grid grid-cols-1 gap-8 md:grid-cols-3">
      <p className="sr-only">{TOPIC.loading}</p>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} lines={4} />
      ))}
    </div>
  );
}

export default async function TopicsRoute({ searchParams }: Props) {
  const f = parseTopicListFilters(await searchParams);
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <header className="flex max-w-read flex-col gap-3 border-b-2 border-line-strong pb-5">
        <h1 className="type-display text-strong">{TOPIC.listTitle}</h1>
        <p className="type-body text-body">{TOPIC.listIntro}</p>
      </header>
      <Filters f={f} />
      <Suspense key={topicListHref(f)} fallback={<Loading />}>
        <Results f={f} />
      </Suspense>
    </div>
  );
}
