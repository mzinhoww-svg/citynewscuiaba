import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import {
  AiAnswer,
  AskChatLazy,
  AiStatusPanel,
  Button,
  SearchGroupBlock,
  SourceRail,
  SuggestionChip,
  TextField,
} from "@/components";
import { ASK } from "@/content/pt-BR/ask";
import type { AiAnswer as AiAnswerData } from "@/lib/ai/answer";
import type { SearchParamsInput } from "@/lib/filters/section";
import { firstParam } from "@/lib/filters/section";
import { formatHour } from "@/lib/format/date";
import {
  normalizeQuery,
  questionQuery,
  queryTerms,
  SEARCH_DEFAULTS,
  searchHref,
} from "@/lib/search";
import { answerQuestion } from "@/lib/search/ask";
import { searchHybrid } from "@/lib/search/server";
import { pageMetadata } from "@/lib/seo/metadata";

/**
 * Pergunte ao CityNews (P13, spec §5.5) como chat (UI-T13, spec 2026-10-02-ui-publica §4.8).
 * A página continua RSC (metadados e fallback); o chat é client e carrega por `next/dynamic` só
 * aqui. `/pergunte?q=` abre a conversa já com a pergunta enviada.
 *
 * Sem JavaScript, o campo do chat é um formulário `GET /pergunte?q=&modo=simples`: nesse modo a
 * resposta é montada no servidor e entregue inteira no HTML (sem Suspense, que precisaria de JS
 * para trocar o "carregando" pela resposta). Falha, limite ou assistente desligado mostram a
 * busca tradicional. Sem login. Fora do índice (robots.txt e `noindex`, A-044).
 */
const CONTAINER = "mx-auto w-full max-w-page px-gutter";
const MAX_QUESTION = 300;

type Props = { searchParams: Promise<SearchParamsInput> };

/** Primeiro `q` não vazio (sem JS, a pergunta inicial tocada vem antes do campo vazio). */
function readQuestion(sp: SearchParamsInput): string {
  const raw = sp instanceof URLSearchParams ? sp.getAll("q") : sp.q;
  const all = Array.isArray(raw) ? raw : [raw ?? ""];
  const q = all.map((v) => normalizeQuery(v)).find(Boolean) ?? "";
  return q.slice(0, MAX_QUESTION);
}

const isSimple = (sp: SearchParamsInput) => firstParam(sp, "modo") === ASK.simpleMode;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = readQuestion(await searchParams);
  return pageMetadata({
    title: ASK.title,
    documentTitle: ASK.documentTitle(q),
    description: ASK.metaDescription,
    path: "/pergunte",
    noindex: true,
  });
}

const askHref = (q: string) =>
  `/pergunte?q=${encodeURIComponent(q)}&modo=${encodeURIComponent(ASK.simpleMode)}`;
const traditionalHref = (q: string) => searchHref({ ...SEARCH_DEFAULTS, q: questionQuery(q) || q });

/** Busca tradicional abaixo da falha (P13: "falha → fallback para busca tradicional"). */
async function Fallback({ question }: { question: string }) {
  const q = questionQuery(question) || question;
  const result = await searchHybrid(q, { ...SEARCH_DEFAULTS, q }, { loose: true });
  const groups = result.ok ? result.value.groups.slice(0, 5) : [];
  const terms = queryTerms(q);
  return (
    <section aria-labelledby="busca-tradicional" className="flex flex-col gap-2">
      <h2 id="busca-tradicional" className="type-section text-strong">
        {ASK.fallbackTitle}
      </h2>
      {groups.length === 0 ? (
        <p className="type-body text-body">{ASK.fallbackEmpty}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line-section">
          {groups.map((g) => (
            <li
              key={g.topic ? `topic:${g.topic.id}` : `${g.items[0]?.kind}:${g.items[0]?.item.id}`}
            >
              <SearchGroupBlock group={g} terms={terms} />
            </li>
          ))}
        </ol>
      )}
      <p>
        <Link
          href={traditionalHref(question)}
          className="inline-flex min-h-tap items-center text-14 font-semibold text-link underline underline-offset-4"
        >
          {ASK.fallbackAll}
        </Link>
      </p>
    </section>
  );
}

function ErrorState({
  question,
  answer,
  aiOff,
  limit,
}: {
  question: string;
  answer: Extract<AiAnswerData, { kind: "error" }>;
  aiOff: boolean;
  limit: number;
}) {
  const title = aiOff
    ? ASK.errorTitle.off
    : answer.reason === "rate_limited"
      ? ASK.errorTitle.rate_limited(limit)
      : ASK.errorTitle[answer.reason];
  const text = aiOff
    ? ASK.errorText.off
    : answer.reason === "rate_limited"
      ? answer.retryAt
        ? ASK.errorText.rate_limited(formatHour(answer.retryAt))
        : ASK.errorText.limitNoTime
      : ASK.errorText[answer.reason];
  const canRetry = !aiOff && answer.reason !== "rate_limited";
  return (
    <div className="flex flex-col gap-8">
      <AiStatusPanel
        tone="error"
        title={title}
        actions={
          canRetry ? (
            <Button href={askHref(question)} size="md">
              {ASK.retry}
            </Button>
          ) : undefined
        }
      >
        <p>{text}</p>
      </AiStatusPanel>
      <Fallback question={question} />
    </div>
  );
}

async function Answer({ question }: { question: string }) {
  const { answer, aiOff, limit } = await answerQuestion(question);
  const now = new Date();

  if (answer.kind === "error")
    return <ErrorState question={question} answer={answer} aiOff={aiOff} limit={limit} />;

  if (answer.kind === "insufficient") {
    const suggestion =
      answer.suggestion === "suggest_story"
        ? { href: "/contato", label: ASK.suggestion.suggest_story }
        : answer.suggestion === "widen_period"
          ? { href: traditionalHref(question), label: ASK.suggestion.widen_period }
          : { href: traditionalHref(question), label: ASK.suggestion.traditional_search };
    return (
      <div className="flex flex-col gap-6">
        <AiStatusPanel
          tone="insufficient"
          title={ASK.insufficientTitle}
          actions={
            <>
              <SuggestionChip href={suggestion.href} tone="neutral">
                {suggestion.label}
              </SuggestionChip>
              {answer.suggestion !== "traditional_search" && (
                <SuggestionChip href={traditionalHref(question)} tone="neutral">
                  {ASK.suggestion.traditional_search}
                </SuggestionChip>
              )}
              {answer.suggestion !== "suggest_story" && (
                <SuggestionChip href="/contato" tone="neutral">
                  {ASK.suggestion.suggest_story}
                </SuggestionChip>
              )}
            </>
          }
        >
          <p>{ASK.insufficientText(answer.found.length)}</p>
        </AiStatusPanel>
        {answer.found.length > 0 && (
          <SourceRail
            sources={answer.found}
            title={ASK.foundTitle}
            idPrefix="encontrada"
            now={now}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_var(--layout-rail)]">
      <div className="flex min-w-0 flex-col gap-6">
        <AiAnswer answer={answer} />
        <section aria-labelledby="refinar" className="flex flex-col gap-2">
          <h2 id="refinar" className="type-eyebrow text-meta">
            {ASK.refineTitle}
          </h2>
          <div className="flex flex-wrap gap-2">
            <SuggestionChip href={traditionalHref(question)} tone="neutral">
              {ASK.traditional}
            </SuggestionChip>
            {ASK.examples
              .filter((e) => e !== question)
              .slice(0, 2)
              .map((e) => (
                <SuggestionChip key={e} href={askHref(e)}>
                  {e}
                </SuggestionChip>
              ))}
          </div>
        </section>
      </div>
      <SourceRail
        sources={answer.sources}
        now={now}
        className="lg:sticky lg:top-sticky-public lg:self-start"
      />
    </div>
  );
}

export default async function AskPage({ searchParams }: Props) {
  const sp = await searchParams;
  const question = readQuestion(sp);
  if (question && isSimple(sp)) return <SimpleAsk question={question} />;
  return (
    <div className={`${CONTAINER} flex flex-col gap-6 py-6 lg:py-8`}>
      <header className="flex max-w-read flex-col gap-2">
        <h1 className="type-screen-title text-strong lg:type-display">{ASK.title}</h1>
        <p className="type-body text-body">{ASK.intro}</p>
      </header>
      <AskChatLazy initialQuestion={question || undefined} />
    </div>
  );
}

/** Modo simples (sem JavaScript): formulário GET e resposta inteira no HTML do servidor. */
function SimpleAsk({ question }: { question: string }) {
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <header className="flex max-w-read flex-col gap-4">
        <h1 className="type-display text-strong">{ASK.title}</h1>
        <p className="type-body text-body">{ASK.intro}</p>
        <Form action="/pergunte" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="modo" value={ASK.simpleMode} />
          <TextField
            key={question}
            id="pergunta"
            name="q"
            label={ASK.label}
            placeholder={ASK.placeholder}
            defaultValue={question}
            maxLength={MAX_QUESTION}
            autoComplete="off"
            className="min-w-0 flex-1"
          />
          <Button type="submit" size="md">
            {ASK.submit}
          </Button>
        </Form>
      </header>

      <section aria-labelledby="conversa" className="flex flex-col gap-6">
        <h2 id="conversa" className="sr-only">
          {ASK.conversation}
        </h2>
        <div className="flex max-w-read flex-col gap-1 self-start rounded-lg bg-section px-4 py-3">
          <p className="type-eyebrow text-meta">{ASK.youAsked}</p>
          <p className="type-body font-semibold text-strong">{question}</p>
        </div>
        <div aria-live="polite" data-testid="resposta-ia">
          <Answer question={question} />
        </div>
      </section>
    </div>
  );
}
