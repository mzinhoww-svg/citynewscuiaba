"use client";

import type { ReactNode } from "react";
import { ASK } from "@/content/pt-BR/ask";
import type { ChatTurn } from "@/lib/ask";
import { formatHour } from "@/lib/format/date";
import { questionQuery, SEARCH_DEFAULTS, searchHref } from "@/lib/search";
import { Logo } from "../editorial/Logo";
import { Icon } from "../ui/Icon";
import { AiAnswer } from "./AiAnswer";
import { AiStatusPanel } from "./AiStatusPanel";
import { ChatSources } from "./ChatSources";
import { SuggestionChip } from "./SuggestionChip";

export interface ChatMessageProps {
  turn: ChatTurn;
  onRetry: (id: string) => void;
  onCite: (turnId: string, n: number) => void;
  /** Fonte aberta pela citação neste turno. */
  activeSource?: number;
  sourcesOpen?: boolean;
  onToggleSources?: (turnId: string, open: boolean) => void;
}

export const traditionalHref = (q: string) =>
  searchHref({ ...SEARCH_DEFAULTS, q: questionQuery(q) || q });

/** Prefixo dos ids das fontes sob a bolha (alvo das citações), único por turno. */
export const inlineSourcePrefix = (turnId: string) => `${turnId}-fonte`;

function Avatar() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-line-section bg-card-white"
    >
      <Logo variant="symbol" size="sm" decorative />
    </span>
  );
}

function Traditional({ question }: { question: string }) {
  return (
    <SuggestionChip href={traditionalHref(question)} tone="neutral">
      {ASK.chat.traditional}
    </SuggestionChip>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-pill bg-action-primary px-5 text-14 font-semibold text-on-inverse hover:bg-action-primary-pressed"
    >
      <Icon name="refresh-cw" size={16} />
      {ASK.retry}
    </button>
  );
}

function Processing({ turn }: { turn: ChatTurn }) {
  const step = turn.step ?? "sources";
  return (
    <p aria-busy="true" className="flex min-h-tap items-center gap-2 type-body text-body">
      <Icon name="refresh-cw" size={18} className="shrink-0 text-ai motion-safe:animate-spin" />
      <span>{ASK.chat.steps[step]}</span>
    </p>
  );
}

function Reply({
  turn,
  onRetry,
  onCite,
  activeSource,
  sourcesOpen,
  onToggleSources,
}: ChatMessageProps) {
  const a = turn.answer;
  const prefix = inlineSourcePrefix(turn.id);

  if (turn.status === "processing") return <Processing turn={turn} />;

  if (turn.status === "answer" && a?.kind === "answer") {
    return (
      <div className="flex flex-col gap-3">
        <AiAnswer answer={a} sourceIdPrefix={prefix} onCite={(n) => onCite(turn.id, n)} />
        <ChatSources
          sources={a.sources}
          idPrefix={prefix}
          openId={activeSource}
          open={sourcesOpen}
          onToggle={(open) => onToggleSources?.(turn.id, open)}
          className="lg:hidden"
        />
      </div>
    );
  }

  if (turn.status === "refused" && a?.kind === "insufficient") {
    return (
      <div className="flex flex-col gap-3">
        <AiStatusPanel
          tone="insufficient"
          title={ASK.insufficientTitle}
          actions={<Traditional question={turn.question} />}
        >
          <p>{ASK.insufficientText(a.found.length)}</p>
        </AiStatusPanel>
        <ChatSources
          sources={a.found}
          idPrefix={prefix}
          openId={activeSource}
          open={sourcesOpen}
          onToggle={(open) => onToggleSources?.(turn.id, open)}
          summary={ASK.chat.foundCount(a.found.length)}
          title={ASK.foundTitle}
        />
      </div>
    );
  }

  if (turn.status === "rate_limited") {
    const retryAt = a?.kind === "error" ? a.retryAt : undefined;
    return (
      <AiStatusPanel
        tone="error"
        title={ASK.errorTitle.rate_limited(turn.limit ?? 20)}
        actions={<Traditional question={turn.question} />}
      >
        <p>{ASK.errorText.rate_limited(retryAt ? formatHour(retryAt) : "")}</p>
      </AiStatusPanel>
    );
  }

  if (turn.status === "off") {
    return (
      <AiStatusPanel
        tone="error"
        title={ASK.errorTitle.off}
        actions={<Traditional question={turn.question} />}
      >
        <p>{ASK.errorText.off}</p>
      </AiStatusPanel>
    );
  }

  // Falha: do serviço (com motivo) ou da rede (stream sem `answer`).
  const reason = a?.kind === "error" && a.reason !== "rate_limited" ? a.reason : null;
  return (
    <AiStatusPanel
      tone="error"
      title={reason ? ASK.errorTitle[reason] : ASK.chat.networkTitle}
      actions={
        <>
          <RetryButton onClick={() => onRetry(turn.id)} />
          <Traditional question={turn.question} />
        </>
      }
    >
      <p>{reason ? ASK.errorText[reason] : ASK.chat.networkText}</p>
    </AiStatusPanel>
  );
}

function Bubble({ author, children }: { author: "person" | "citynews"; children: ReactNode }) {
  if (author === "person")
    return (
      <div data-author="person" className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-br-xs bg-section px-4 py-3">{children}</div>
      </div>
    );
  return (
    <div data-author="citynews" className="flex items-start gap-3">
      <Avatar />
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    </div>
  );
}

/**
 * Um turno do chat (UI-T13): a bolha da pessoa à direita e a do CityNews à esquerda (avatar
 * "O Ponto"). A do CityNews mostra o passo enquanto processa, a resposta com citações e fontes
 * recolhíveis, a recusa ou a falha com a ação cabível. Nenhum texto diz "IA".
 *
 * ```tsx
 * <ChatMessage turn={turn} onRetry={retry} onCite={(id, n) => open(id, n)} />
 * ```
 */
export function ChatMessage(props: ChatMessageProps) {
  const { turn } = props;
  return (
    <div className="flex flex-col gap-4">
      <Bubble author="person">
        <p className="sr-only">{ASK.chat.youAsked}</p>
        <p className="type-body whitespace-pre-line text-strong">{turn.question}</p>
      </Bubble>
      <Bubble author="citynews">
        <p className="sr-only">{ASK.chat.citynews}:</p>
        <Reply {...props} />
      </Bubble>
    </div>
  );
}
