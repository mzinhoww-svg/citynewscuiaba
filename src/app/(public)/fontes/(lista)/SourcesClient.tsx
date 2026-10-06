"use client";

import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  Button,
  Chip,
  CollapsibleFilters,
  EmptyState,
  InlineAlert,
  PopularSourcesRail,
  SourceCard,
  SourceRow,
  Tabs,
  Toggle,
} from "@/components";
import { SOURCE_TEXT } from "@/content/pt-BR/recommendations";
import { SOURCES_PAGE as T } from "@/content/pt-BR/sources-list";
import { ANON_TEXT } from "@/content/pt-BR/privacy-anon";
import { requestLoginInvite } from "@/lib/anon/invite";
import type { DismissReason } from "@/lib/anon/types";
import { useAnonProfile } from "@/lib/anon/use-profile";
import { useConsent } from "@/lib/consent/client";
import { useTrack } from "@/lib/events/use-track";
import { LOCAL_LOCALITIES } from "@/lib/ranking/explain";
import type { RankList, RecConfig } from "@/lib/ranking/types";
import {
  PERIODS,
  REGIONS,
  TAB_ORDER,
  THEMES,
  buildTab,
  capPopularItems,
  fromProfile,
  isNoHistory,
  personalizeEntries,
  sourcesHref,
  toCardData,
  topicContext,
  type SourceCardView,
  type SourceListEntry,
  type SourcesQuery,
} from "@/lib/sources/screen";

/** Item agregado já renderizado no servidor (item 86): o cliente só escolhe quais mostrar. */
export interface SourcesItemCard {
  id: string;
  sourceSlug: string;
  card: ReactNode;
}

export interface SourcesClientProps {
  entries: SourceListEntry[];
  /** Últimas das fontes: cards prontos do servidor, na ordem de publicação. */
  items: SourcesItemCard[];
  config: RecConfig;
  query: SourcesQuery;
  /** Personalização lida do cookie no servidor (primeira renderização igual à do servidor). */
  initialPersonalization: boolean;
  /** Relógio do servidor (datas relativas iguais no servidor e na hidratação). */
  now: string;
}

const LIMIT = 12;
const ITEMS_LIMIT = 8;
const NO_HISTORY_LIMIT = 6;
const PANEL = "fontes";

type Notice = { text: string; undo: () => void };

/**
 * Parte interativa de Fontes em destaque: abas (`?aba=`), switch de personalização, seguir e
 * ocultar com motivo e desfazer. Tudo local ao navegador (perfil anônimo), sem login. Os cards
 * dos itens agregados vêm prontos do servidor (item 86): aqui só a escolha e a ordem.
 * `data-ready` marca que o perfil local já foi aplicado (testes e2e esperam por ele).
 */
export function SourcesClient({
  entries,
  items,
  config,
  query,
  initialPersonalization,
  now: nowIso,
}: SourcesClientProps) {
  const [consent, updateConsent] = useConsent();
  const personalization = consent.decided ? consent.personalization : initialPersonalization;
  const { profile, degraded, ready, act } = useAnonProfile();
  const send = useTrack();
  const [tab, setTab] = useState<RankList>(query.tab);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const reader = useMemo(() => fromProfile(profile), [profile]);
  const list = useMemo(
    () => personalizeEntries(entries, reader, personalization, now),
    [entries, reader, personalization, now],
  );
  const bySlug = useMemo(() => new Map(list.map((e) => [e.slug, e])), [list]);
  const topic = topicContext(reader, personalization);
  const noHistory = isNoHistory(reader, personalization);

  const tabOpts = {
    personalization,
    hidden: reader.hidden,
    config,
    limit: LIMIT,
    period: query.period,
  };
  const cards = (key: RankList, limit = LIMIT): SourceCardView[] =>
    buildTab(list, key, { ...tabOpts, limit }).map((r) =>
      toCardData(bySlug.get(r.slug)!, r, { topic }, now),
    );

  // Sem histórico, Recomendadas fica curta e abre espaço para as fontes locais (P14).
  const current = cards(tab, tab === "recommended" && noHistory ? NO_HISTORY_LIMIT : LIMIT);
  const popularSlugs = buildTab(list, "popular", tabOpts).map((r) => r.slug);
  const rail = buildTab(
    list.filter((e) => LOCAL_LOCALITIES.includes(e.locality)),
    "popular",
    { ...tabOpts, limit: 8 },
  ).map((r) => toCardData(bySlug.get(r.slug)!, r, {}, now));
  const popularItems =
    tab === "popular" ? capPopularItems(items, popularSlugs, ITEMS_LIMIT, config.cap) : [];
  const shown = new Set(current.map((c) => c.slug));
  const localPicks =
    tab === "recommended" && noHistory
      ? cards("local", LIMIT)
          .filter((c) => !shown.has(c.slug))
          .slice(0, 4)
      : [];

  const show = (n: Notice) => {
    setNotice(n);
    // Foco no aviso: quem usa teclado não perde o lugar quando o card some.
    requestAnimationFrame(() => noticeRef.current?.focus());
  };

  const selectTab = (next: RankList) => {
    setTab(next);
    setNotice(null);
    try {
      window.history.replaceState(null, "", sourcesHref(query, { tab: next }));
    } catch {
      // Sem history (navegador antigo): a aba vale só nesta visita.
    }
  };

  const onFollow = (slug: string, next: boolean) => {
    void act((s) => (next ? s.follow("source", slug) : s.unfollow("source", slug))).then(() => {
      if (next) {
        void send(
          "source_followed",
          { surface: "fontes", fromRecommendation: tab === "recommended" },
          { sourceId: slug },
        );
        requestLoginInvite("follow");
      } else {
        void send("source_unfollowed", { surface: "fontes" }, { sourceId: slug });
      }
    });
  };

  const onHide = (slug: string, reason: DismissReason) => {
    const card = current.find((c) => c.slug === slug) ?? localPicks.find((c) => c.slug === slug);
    const ranked = buildTab(list, tab, tabOpts).find((r) => r.slug === slug);
    void send(
      "recommendation_dismissed",
      { list: tab, reason: ranked?.reason ?? "regional_popular", dismissReason: reason },
      { sourceId: slug },
    );
    if (reason === "no_personalization") {
      // Spec §7.4: este motivo desliga a personalização (a fonte continua nas listas).
      updateConsent({ personalization: false }, "dismiss");
      show({
        text: T.personalizationDone,
        undo: () => updateConsent({ personalization: true }, "switch"),
      });
      return;
    }
    void act((s) => s.hide(slug, reason));
    show({
      text: T.hiddenDone(card?.name ?? slug),
      undo: () => void act((s) => s.unhide(slug)),
    });
  };

  const onListClick = (e: MouseEvent<HTMLElement>) => {
    const link = (e.target as HTMLElement).closest("a");
    const item = link?.closest<HTMLElement>("[data-slug]");
    if (!link || !item) return;
    void send(
      "recommendation_clicked",
      {
        list: tab,
        reason: item.dataset.reason ?? "",
        position: Number(item.dataset.position ?? 0),
      },
      { sourceId: item.dataset.slug ?? null },
    );
  };

  const hiddenSources = (profile?.hidden ?? []).flatMap((h) => {
    const e = entries.find((x) => x.slug === h.sourceSlug);
    return e ? [{ slug: e.slug, name: e.name }] : [];
  });
  const filtered = Boolean(query.region || query.theme || query.period !== "semana");
  const tabIndex = TAB_ORDER.indexOf(tab);

  return (
    <div data-ready={ready ? "true" : undefined} className="flex flex-col gap-8">
      <PopularSourcesRail title={SOURCE_TEXT.railTitle} sources={rail} />

      <section
        aria-label={T.personalization}
        className="flex flex-col gap-3 border border-line-section bg-card-white p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex flex-col gap-1">
          <p className="type-body font-semibold text-strong">{T.personalization}</p>
          <p className="type-meta text-meta">
            {personalization ? T.personalizationOn : T.personalizationOff}{" "}
            <a href={T.personalizationHowHref} className="text-link underline underline-offset-4">
              {T.personalizationHow}
            </a>
          </p>
        </div>
        <Toggle
          label={T.personalization}
          checked={personalization}
          onChange={(v) => updateConsent({ personalization: v }, "switch")}
        />
      </section>

      {degraded && (
        <InlineAlert tone="warn" title={ANON_TEXT.degraded}>
          <p>{ANON_TEXT.degradedDetail}</p>
        </InlineAlert>
      )}

      <CollapsibleFilters
        activeCount={[query.region, query.theme, query.period !== "semana"].filter(Boolean).length}
        clearHref={sourcesHref({ tab, period: "semana" })}
        clearLabel={T.clearFilters}
      >
        <nav aria-label={T.filtersLabel} className="flex flex-col gap-3">
          {(
            [
              ["period", PERIODS],
              ["region", REGIONS],
              ["theme", THEMES],
            ] as const
          ).map(([group, values]) => (
            <div key={group} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <p className="w-24 shrink-0 type-meta font-semibold text-strong">{T.groups[group]}</p>
              <ul className="flex snap-x gap-2 overflow-x-auto py-1 scrollbar-none">
                {values.map((v) => {
                  const active = query[group] === v;
                  const href =
                    group === "period"
                      ? sourcesHref(
                          { ...query, tab },
                          { period: active ? "semana" : (v as SourcesQuery["period"]) },
                        )
                      : sourcesHref({ ...query, tab }, { [group]: active ? null : v });
                  return (
                    <li key={v} className="snap-start">
                      <Chip href={href} active={active}>
                        {T.filters[v]}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </CollapsibleFilters>

      <div className="flex flex-col gap-5">
        <Tabs
          label={T.tabsLabel}
          items={TAB_ORDER.map((t) => T.tabs[t])}
          value={T.tabs[tab]}
          onChange={(label) => {
            const next = TAB_ORDER.find((t) => T.tabs[t] === label);
            if (next) selectTab(next);
          }}
          idPrefix={PANEL}
          layout="scroll"
        />

        {notice && (
          <InlineAlert
            ref={noticeRef}
            tone="success"
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  notice.undo();
                  setNotice(null);
                }}
              >
                {T.undo}
              </Button>
            }
          >
            <p>{notice.text}</p>
          </InlineAlert>
        )}

        {TAB_ORDER.map((t, i) =>
          i === tabIndex ? (
            <div
              key={t}
              role="tabpanel"
              id={`${PANEL}-painel-${i}`}
              aria-labelledby={`${PANEL}-aba-${i}`}
              className="flex flex-col gap-6"
              onClick={onListClick}
            >
              <TabBody
                tab={tab}
                cards={current}
                noHistory={noHistory}
                personalization={personalization}
                localPicks={localPicks}
                filtered={filtered}
                clearHref={sourcesHref({ tab, period: "semana" })}
                onFollow={onFollow}
                onHide={onHide}
                onShowLocal={() => selectTab("local")}
                now={now}
              />
              {popularItems.length > 0 && (
                <section
                  aria-labelledby="fontes-itens"
                  className="flex flex-col gap-4 bg-aggregated p-5 lg:p-8"
                >
                  <div className="flex flex-col gap-1.5">
                    <h2 id="fontes-itens" className="type-section text-strong">
                      {T.itemsTitle}
                    </h2>
                    <p className="type-meta text-meta">
                      {T.itemsNotice} {T.capNote}
                    </p>
                  </div>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {popularItems.map((item) => (
                      <li key={item.id} className="flex min-w-0" data-item-source={item.sourceSlug}>
                        {item.card}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          ) : (
            <div
              key={t}
              role="tabpanel"
              id={`${PANEL}-painel-${i}`}
              aria-labelledby={`${PANEL}-aba-${i}`}
              hidden
            />
          ),
        )}
      </div>

      {hiddenSources.length > 0 && (
        <details className="border-t border-line-subtle pt-4">
          <summary className="inline-flex min-h-tap cursor-pointer items-center type-body font-semibold text-strong">
            {T.hiddenTitle(hiddenSources.length)}
          </summary>
          <ul className="mt-2 flex flex-col">
            {hiddenSources.map((h) => (
              <li
                key={h.slug}
                className="flex items-center justify-between gap-3 border-t border-line-subtle py-2"
              >
                <span className="type-body text-strong">{h.name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={T.showAgainLabel(h.name)}
                  onClick={() => void act((s) => s.unhide(h.slug))}
                >
                  {T.showAgain}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface TabBodyProps {
  tab: RankList;
  cards: SourceCardView[];
  noHistory: boolean;
  personalization: boolean;
  localPicks: SourceCardView[];
  filtered: boolean;
  clearHref: string;
  onFollow: (slug: string, next: boolean) => void;
  onHide: (slug: string, reason: DismissReason) => void;
  onShowLocal: () => void;
  now: Date;
}

function RowList({
  cards,
  onFollow,
  onHide,
}: {
  cards: SourceCardView[];
  onFollow: TabBodyProps["onFollow"];
  onHide?: TabBodyProps["onHide"];
}) {
  return (
    <ul className="flex flex-col">
      {cards.map((c, i) => (
        <SourceRow
          key={c.slug}
          source={c}
          onFollow={onFollow}
          onHide={onHide}
          data={{ slug: c.slug, reason: c.reason, position: i + 1 }}
        />
      ))}
    </ul>
  );
}

function TabBody({
  tab,
  cards,
  noHistory,
  personalization,
  localPicks,
  filtered,
  clearHref,
  onFollow,
  onHide,
  onShowLocal,
  now,
}: TabBodyProps) {
  if (tab === "followed") {
    if (cards.length === 0)
      return (
        <EmptyState
          title={T.followedEmptyTitle}
          icon="plus"
          actions={
            <Button size="md" onClick={onShowLocal}>
              {T.followedEmptyAction}
            </Button>
          }
        >
          <p>{T.followedEmptyText}</p>
        </EmptyState>
      );
    return <RowList cards={cards} onFollow={onFollow} />;
  }

  if (cards.length === 0)
    return (
      <EmptyState
        title={T.emptyTitle}
        actions={
          filtered ? (
            <Button href={clearHref} size="md" variant="outline">
              {T.clearFilters}
            </Button>
          ) : undefined
        }
      >
        <p>{T.emptyText}</p>
      </EmptyState>
    );

  if (tab === "recommended")
    return (
      <>
        {noHistory && (
          <InlineAlert title={T.noHistoryTitle} role="none">
            <p>{personalization ? T.noHistoryText : T.noHistoryOff}</p>
          </InlineAlert>
        )}
        <RowList cards={cards} onFollow={onFollow} onHide={onHide} />
        {localPicks.length > 0 && (
          <section aria-labelledby="fontes-locais-inicio" className="flex flex-col gap-3">
            <h2 id="fontes-locais-inicio" className="type-section text-strong">
              {T.localPicks}
            </h2>
            <RowList cards={localPicks} onFollow={onFollow} onHide={onHide} />
          </section>
        )}
      </>
    );

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c, i) => (
        <li
          key={c.slug}
          className="flex"
          data-slug={c.slug}
          data-reason={c.reason}
          data-position={i + 1}
        >
          <SourceCard source={c} onFollow={onFollow} onHide={onHide} now={now} className="flex-1" />
        </li>
      ))}
    </ul>
  );
}
