"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EDITOR_TEXT as T } from "@/content/pt-BR/studio";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Panel } from "../ui/Panel";
import type { ActionReply } from "./QueueTable";

export type SuggestionField = "title" | "dek" | "seo_title" | "seo_description" | "body";

export interface AiSuggestionItem {
  id: string;
  field: SuggestionField;
  value: string;
  rationale: string | null;
  agentId: string;
  promptVersion: number | null;
}

export interface AiSuggestionInlineProps {
  articleId: string;
  baseVersion: number;
  suggestions: AiSuggestionItem[];
  /** Sem ações (papel sem edição): só leitura. */
  apply?: (i: { id: string; articleId: string; baseVersion: number }) => Promise<ActionReply>;
  discard?: (i: { id: string; articleId: string }) => Promise<ActionReply>;
  className?: string;
}

/**
 * Sugestões da IA por campo, marcadas com fundo IA soft e borda tracejada (DESIGN.md §5). Nada
 * entra na matéria sem clique: "Aplicar título sugerido" grava a origem (agente, versão do prompt
 * e quem aceitou); "Descartar" registra a decisão.
 */
export function AiSuggestionInline({
  articleId,
  baseVersion,
  suggestions,
  apply,
  discard,
  className,
}: AiSuggestionInlineProps) {
  const router = useRouter();
  const [status, setStatus] = useState<ActionReply | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<ActionReply>) =>
    start(async () => {
      const r = await fn();
      setStatus(r);
      if (r.ok) router.refresh();
    });

  return (
    <Panel aria-labelledby="sugestoes-titulo" className={className}>
      <h2 id="sugestoes-titulo" className="flex items-center gap-2 type-section text-strong">
        <Icon name="layers" size={20} className="text-ai" />
        {T.suggestions}
      </h2>
      <p className="mt-1 type-meta text-meta">{T.suggestionsIntro}</p>
      <p role="status" aria-live="polite" className="mt-2 type-meta">
        {status && (
          <span className={status.ok ? "text-service" : "text-danger"}>{status.message}</span>
        )}
      </p>
      {suggestions.length === 0 ? (
        <p className="mt-2 type-body text-meta">{T.noSuggestions}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {suggestions.map((s) => (
            <li key={s.id} className="rounded-md border border-dashed border-ai bg-ia-soft p-3">
              <p className="type-eyebrow text-ai">{T.suggestionField[s.field]}</p>
              <p className="mt-1 type-body text-strong">{s.value}</p>
              {s.rationale && <p className="mt-1 type-meta text-meta">{s.rationale}</p>}
              <p className="mt-1 type-meta text-ai">{T.agent(s.agentId, s.promptVersion)}</p>
              {apply && discard && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => apply({ id: s.id, articleId, baseVersion }))}
                  >
                    {T.apply[s.field]}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => run(() => discard({ id: s.id, articleId }))}
                    aria-label={`${T.discard}: ${T.suggestionField[s.field]}`}
                  >
                    {T.discard}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
