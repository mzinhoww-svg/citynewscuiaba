"use client";

import { useId } from "react";
import { ASK } from "@/content/pt-BR/ask";
import type { ChatTurn } from "@/lib/ask";
import { Logo } from "../editorial/Logo";
import { ChatMessage } from "./ChatMessage";

export interface ChatThreadProps {
  messages: ChatTurn[];
  /** Pergunta inicial tocada. */
  onAsk: (question: string) => void;
  onRetry: (id: string) => void;
  onCite: (turnId: string, n: number) => void;
  /** Citação aberta: turno e número da fonte. */
  active?: { turnId: string; n: number } | null;
  /** Turnos com a lista de fontes aberta sob a bolha. */
  openSources?: Readonly<Record<string, boolean>>;
  onToggleSources?: (turnId: string, open: boolean) => void;
  /** Formulário do campo de envio: sem JavaScript, as perguntas iniciais enviam por ele. */
  formId?: string;
  starters?: readonly string[];
}

function Welcome({
  onAsk,
  formId,
  starters,
}: Pick<ChatThreadProps, "onAsk" | "formId"> & { starters: readonly string[] }) {
  const id = useId();
  return (
    <section aria-labelledby={id} data-author="citynews" className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-pill border border-line-section bg-card-white"
      >
        <Logo variant="symbol" size="sm" decorative />
      </span>
      <div className="flex min-w-0 flex-col gap-3">
        <h2 id={id} className="type-section text-strong">
          {ASK.chat.welcomeTitle}
        </h2>
        <p className="type-body text-body">{ASK.chat.welcomeText}</p>
        <ul aria-label={ASK.chat.startersLabel} className="flex flex-col items-start gap-2">
          {starters.map((q) => (
            <li key={q}>
              <button
                type="submit"
                form={formId}
                name="q"
                value={q}
                onClick={(e) => {
                  e.preventDefault();
                  onAsk(q);
                }}
                className="inline-flex min-h-tap cursor-pointer items-center rounded-pill border border-ai bg-ia-soft px-4 py-2 text-left text-14 text-ai hover:bg-card-white"
              >
                {q}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Conversa do Pergunte ao CityNews (UI-T13, spec §4.8): vazia, mostra as boas-vindas e 4
 * perguntas iniciais como botões; depois, um item por turno (bolha da pessoa e do CityNews).
 *
 * ```tsx
 * <ChatThread messages={messages} onAsk={send} onRetry={retry} onCite={openSource} />
 * ```
 */
export function ChatThread({
  messages,
  onAsk,
  onRetry,
  onCite,
  active,
  openSources,
  onToggleSources,
  formId,
  starters = ASK.examples,
}: ChatThreadProps) {
  if (messages.length === 0)
    return <Welcome onAsk={onAsk} formId={formId} starters={starters.slice(0, 4)} />;
  return (
    <ol aria-label={ASK.conversation} className="flex flex-col gap-8">
      {messages.map((t) => (
        <li key={t.id} data-turn={t.id} className="scroll-mt-24">
          <ChatMessage
            turn={t}
            onRetry={onRetry}
            onCite={onCite}
            activeSource={active?.turnId === t.id ? active.n : undefined}
            sourcesOpen={openSources?.[t.id] ?? false}
            onToggleSources={onToggleSources}
          />
        </li>
      ))}
    </ol>
  );
}
