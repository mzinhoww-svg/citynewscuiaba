import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Button, EmptyState, Icon } from "@/components";
import { SOURCES_PAGE as T } from "@/content/pt-BR/sources";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { getRecConfig, getSourceSignals, listAggregated } from "@/lib/db/queries";
import { pageMetadata } from "@/lib/seo/metadata";
import { parseSourcesQuery, sourcesHref, type SourceListEntry } from "@/lib/sources/screen";
import { SourcesClient } from "./SourcesClient";

/**
 * Fontes em destaque (P14, spec §7.5). Dados por requisição (filtros na URL); o ranking sai do
 * servidor sem o perfil local e o navegador refaz com fontes seguidas, ocultadas e, com
 * Personalização, o histórico deste navegador. Login nunca é exigido.
 */
export const metadata: Metadata = pageMetadata({
  title: T.title,
  documentTitle: T.metaTitle,
  description: T.metaDescription,
  path: "/fontes",
});

const CONTAINER = "mx-auto w-full max-w-page px-gutter";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function Header() {
  return (
    <header className="flex flex-col gap-4 border-b-2 border-line-strong pb-5">
      <div className="flex max-w-read flex-col gap-3">
        <h1 className="type-display text-strong">{T.title}</h1>
        <p className="type-body text-body">{T.intro}</p>
      </div>
      <div className="flex max-w-read items-start gap-2 type-meta text-meta">
        <Icon name="info" size={16} className="mt-0.5 shrink-0" />
        <p>
          <strong className="font-semibold text-strong">{T.notice}</strong> {T.noticeDetail}
        </p>
      </div>
    </header>
  );
}

export default async function SourcesRoute({ searchParams }: Props) {
  const query = parseSourcesQuery(await searchParams);
  const [signals, config, items, jar] = await Promise.all([
    getSourceSignals({
      window: query.period === "hoje" ? "1d" : "7d",
      locality: query.region,
      category: query.theme,
    }),
    getRecConfig(),
    listAggregated({ limit: 40 }),
    cookies(),
  ]);
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);

  if (!signals.ok) {
    const unconfigured = signals.error.kind === "unconfigured";
    return (
      <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
        <Header />
        <EmptyState
          tone={unconfigured ? "empty" : "error"}
          icon={unconfigured ? "globe" : undefined}
          title={unconfigured ? T.unconfiguredTitle : T.errorTitle}
          actions={
            unconfigured ? (
              <Button href="/" size="md" variant="outline">
                {T.backHome}
              </Button>
            ) : (
              <Button href={sourcesHref(query)} size="md">
                {T.retry}
              </Button>
            )
          }
        >
          <p>{unconfigured ? T.unconfiguredText : T.errorText}</p>
        </EmptyState>
      </div>
    );
  }

  const entries: SourceListEntry[] = signals.value;
  return (
    <div className={`${CONTAINER} flex flex-col gap-8 py-8 lg:py-10`}>
      <Header />
      <SourcesClient
        entries={entries}
        items={items.ok ? items.value : []}
        config={config}
        query={query}
        initialPersonalization={consent.personalization}
        now={new Date().toISOString()}
      />
    </div>
  );
}
