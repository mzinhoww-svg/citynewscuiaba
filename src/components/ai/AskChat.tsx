"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ASK } from "@/content/pt-BR/ask";
import type { SourceRef } from "@/lib/ai/answer";
import {
  browserChatHistory,
  type ChatHistoryStore,
  type ChatTurn,
  type SavedConversation,
} from "@/lib/ask";
import { useConsent, useConsentKnown } from "@/lib/consent/client";
import { formatHour } from "@/lib/format/date";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { ChatComposer } from "./ChatComposer";
import { inlineSourcePrefix } from "./ChatMessage";
import { ChatSources } from "./ChatSources";
import { ChatThread } from "./ChatThread";
import { useAskStream } from "./useAskStream";
import { useHydrated } from "./useHydrated";

export interface AskChatProps {
  /** `/pergunte?q=`: a conversa abre já com esta pergunta enviada. */
  initialQuestion?: string;
  /** Injeção para testes; padrão IndexedDB do navegador. */
  historyStore?: ChatHistoryStore;
}

const PANEL_PREFIX = "painel-fonte";

let convSeq = 0;
const newConversationId = () => `c${Date.now().toString(36)}${(convSeq += 1)}`;

/** Fontes da resposta (ou as encontradas na recusa) de um turno. */
function sourcesOf(t: ChatTurn | undefined): SourceRef[] {
  const a = t?.answer;
  if (!a) return [];
  if (a.kind === "answer") return a.sources;
  if (a.kind === "insufficient") return a.found;
  return [];
}

/** O que a região `aria-live` anuncia: o passo enquanto processa e o fim da resposta. */
function liveText(last: ChatTurn | undefined): string {
  if (!last) return "";
  if (last.status === "processing") return ASK.chat.steps[last.step ?? "sources"];
  if (last.status === "answer") return ASK.chat.ready;
  if (last.status === "refused") return ASK.chat.readyRefused;
  return ASK.chat.readyProblem;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

/** Elemento visível entre os candidatos (painel no desktop, lista sob a bolha no celular). */
function visibleTarget(ids: string[]): HTMLElement | null {
  const els = ids.flatMap((id) => {
    const el = document.getElementById(id);
    return el ? [el] : [];
  });
  return els.find((el) => el.getClientRects().length > 0) ?? els.at(-1) ?? null;
}

/**
 * Pergunte ao CityNews como chat (UI-T13, spec 2026-10-02-ui-publica-design §4.8). Celular: a
 * conversa e o campo fixo na base, acima da barra inferior. Desktop: histórico local (só com
 * Personalização aceita), conversa de até 720 px e painel de fontes da resposta selecionada.
 * Carregado por `next/dynamic` só em `/pergunte`.
 */
export function AskChat({ initialQuestion, historyStore }: AskChatProps) {
  const { send, retry, reset, messages, busy } = useAskStream();
  const hydrated = useHydrated();
  const [consent] = useConsent();
  const consentKnown = useConsentKnown();
  const historyOn = consent.personalization;
  const store = useMemo(() => historyStore ?? browserChatHistory(), [historyStore]);

  const formId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [conversationId, setConversationId] = useState(newConversationId);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [active, setActive] = useState<{ turnId: string; n: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [openSources, setOpenSources] = useState<Record<string, boolean>>({});

  // `/pergunte?q=`: envia uma vez só, já ao abrir.
  const sentInitial = useRef(false);
  useEffect(() => {
    if (sentInitial.current || !initialQuestion) return;
    sentInitial.current = true;
    send(initialQuestion);
  }, [initialQuestion, send]);

  // Histórico local: só com Personalização. Sem ela (escolha conhecida), apaga o que houver.
  useEffect(() => {
    let live = true;
    if (historyOn) void store.list().then((l) => live && setConversations(l));
    else if (consentKnown) void store.clear().then(() => live && setConversations([]));
    return () => {
      live = false;
    };
  }, [historyOn, consentKnown, store]);

  const settled = messages.length > 0 && messages.every((m) => m.status !== "processing");
  useEffect(() => {
    if (!historyOn || !settled) return;
    let live = true;
    void store
      .save({ id: conversationId, startedAt: messages[0]!.askedAt, turns: messages })
      .then(() => store.list())
      .then((l) => live && setConversations(l));
    return () => {
      live = false;
    };
  }, [historyOn, settled, messages, conversationId, store]);

  // Rola até a pergunta nova sem tirar o foco de onde a pessoa está.
  const count = messages.length;
  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    if (!lastId) return;
    const el = document.querySelector<HTMLElement>(`[data-turn="${lastId}"]`);
    el?.scrollIntoView?.({
      block: "nearest",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [count, lastId]);

  // Celular: a página ganha no fim a altura do campo fixo (rodapé e foco nunca ficam por baixo).
  useEffect(() => {
    const root = document.documentElement;
    const el = composerRef.current;
    root.setAttribute("data-chat-open", "");
    if (!el || typeof ResizeObserver === "undefined")
      return () => root.removeAttribute("data-chat-open");
    const ro = new ResizeObserver(() =>
      root.style.setProperty("--cn-chat-h", `${Math.ceil(el.getBoundingClientRect().height)}px`),
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeAttribute("data-chat-open");
      root.style.removeProperty("--cn-chat-h");
    };
  }, []);

  const focusField = () => inputRef.current?.focus();

  const ask = useCallback(
    (q: string) => {
      send(q);
      setSelected(null);
      inputRef.current?.focus();
    },
    [send],
  );

  const onCite = useCallback((turnId: string, n: number) => {
    setActive({ turnId, n });
    setSelected(turnId);
    setOpenSources((o) => ({ ...o, [turnId]: true }));
    requestAnimationFrame(() => {
      const el = visibleTarget([`${inlineSourcePrefix(turnId)}-${n}`, `${PANEL_PREFIX}-${n}`]);
      if (!el) return;
      el.scrollIntoView?.({
        block: "nearest",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      el.focus({ preventScroll: true });
    });
  }, []);

  const startNew = () => {
    reset();
    setConversationId(newConversationId());
    setActive(null);
    setSelected(null);
    setOpenSources({});
    focusField();
  };

  const load = (c: SavedConversation) => {
    reset(c.turns);
    setConversationId(c.id);
    setActive(null);
    setSelected(null);
    setOpenSources({});
    focusField();
  };

  // Painel: a resposta selecionada (pela citação) ou a última com fontes.
  const panelTurn =
    messages.find((m) => m.id === selected) ??
    [...messages].reverse().find((m) => sourcesOf(m).length > 0);
  const panelSources = sourcesOf(panelTurn);

  return (
    <div
      className={cx(
        "grid grid-cols-1 gap-8 lg:items-start",
        historyOn
          ? "lg:grid-cols-[var(--layout-chat-history)_minmax(0,var(--layout-chat))_var(--layout-rail)]"
          : "lg:grid-cols-[minmax(0,var(--layout-chat))_var(--layout-rail)] lg:justify-center",
      )}
    >
      {historyOn && (
        <HistoryColumn
          conversations={conversations}
          current={conversationId}
          onNew={startNew}
          onLoad={load}
        />
      )}

      <section aria-label={ASK.chat.conversationLabel} className="flex min-w-0 flex-col gap-6">
        {messages.length > 0 && !historyOn && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={startNew}
              className="inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-pill border border-line-control bg-card-white px-4 text-14 font-semibold text-strong hover:bg-section"
            >
              <Icon name="plus" size={16} />
              {ASK.chat.newConversation}
            </button>
          </div>
        )}
        <ChatThread
          messages={messages}
          onAsk={ask}
          onRetry={retry}
          onCite={onCite}
          active={active}
          openSources={openSources}
          onToggleSources={(id, open) => setOpenSources((o) => ({ ...o, [id]: open }))}
          formId={formId}
        />
        <p role="status" aria-live="polite" className="sr-only">
          {liveText(messages.at(-1))}
        </p>
        {/* Sem JavaScript o aviso de privacidade não fecha: o campo fica no fluxo da página para
            nunca ficar sob ele. Hidratado, fica fixo acima da barra inferior e do aviso aberto. */}
        <div
          ref={composerRef}
          data-composer={hydrated ? "fixed" : "static"}
          className={cx(
            "border-t border-line-section bg-page py-3 lg:sticky lg:bottom-consent-safe lg:border-t-0 lg:px-0 lg:pb-6",
            hydrated && "fixed inset-x-0 bottom-chat-safe z-sticky px-gutter",
          )}
        >
          <ChatComposer
            onSend={ask}
            disabled={busy}
            inputRef={inputRef}
            formId={formId}
            serverValue={initialQuestion}
            className="mx-auto w-full max-w-chat"
          />
        </div>
      </section>

      <aside
        aria-label={ASK.chat.panelTitle}
        className="hidden lg:sticky lg:top-sticky-public lg:block"
      >
        {panelSources.length > 0 && panelTurn ? (
          <ChatSources
            variant="panel"
            sources={panelSources}
            idPrefix={PANEL_PREFIX}
            openId={active?.turnId === panelTurn.id ? active.n : undefined}
            title={panelTurn.answer?.kind === "insufficient" ? ASK.foundTitle : ASK.chat.panelTitle}
          />
        ) : (
          <div className="flex flex-col gap-2 border-t border-line-section pt-3">
            <h2 className="type-section text-strong">{ASK.chat.panelTitle}</h2>
            <p className="type-body text-meta">{ASK.chat.panelEmpty}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function HistoryColumn({
  conversations,
  current,
  onNew,
  onLoad,
}: {
  conversations: SavedConversation[];
  current: string;
  onNew: () => void;
  onLoad: (c: SavedConversation) => void;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 lg:sticky lg:top-sticky-public">
      <h2 id={id} className="type-eyebrow text-meta">
        {ASK.chat.historyTitle}
      </h2>
      <button
        type="button"
        onClick={onNew}
        className="inline-flex min-h-tap cursor-pointer items-center gap-2 self-start rounded-pill border border-line-control bg-card-white px-4 text-14 font-semibold text-strong hover:bg-section"
      >
        <Icon name="plus" size={16} />
        {ASK.chat.newConversation}
      </button>
      {conversations.length === 0 ? (
        <p className="type-meta text-meta">{ASK.chat.historyEmpty}</p>
      ) : (
        <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {conversations.map((c) => (
            <li key={c.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onLoad(c)}
                aria-current={c.id === current ? "true" : undefined}
                className={cx(
                  "flex min-h-tap w-full cursor-pointer flex-col items-start rounded-sm px-3 py-2 text-left hover:bg-section",
                  c.id === current && "bg-section",
                )}
              >
                <span className="line-clamp-2 type-body text-strong">{c.turns[0]?.question}</span>
                <time dateTime={c.startedAt} className="type-meta text-meta tabular-nums">
                  {formatHour(c.startedAt)}
                </time>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="type-meta text-meta">{ASK.chat.historyHint}</p>
    </section>
  );
}
