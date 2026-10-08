"use client";

import { ASK } from "@/content/pt-BR/ask";
import type { SourceRef } from "@/lib/ai/answer";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { SourceRail } from "./SourceRail";

export interface ChatSourcesProps {
  sources: SourceRef[];
  /** Prefixo dos ids das fontes (alvo das citações), único por turno. */
  idPrefix: string;
  /** Fonte aberta pela citação [n] (1 = primeira). */
  openId?: number;
  /** `inline`: recolhível sob a bolha · `panel`: coluna de fontes do desktop. */
  variant?: "inline" | "panel";
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** Rótulo do resumo recolhido (padrão "n fontes"). */
  summary?: string;
  title?: string;
  className?: string;
}

/**
 * Fontes numeradas de uma resposta do chat (UI-T13), com o rótulo de origem de cada uma.
 * Sob a bolha ficam recolhidas ("3 fontes"); a citação [n] abre a lista e destaca a fonte n.
 * No desktop, a mesma lista vai para o painel da direita.
 *
 * ```tsx
 * <ChatSources sources={answer.sources} idPrefix="t1-fonte" openId={2} open />
 * ```
 */
export function ChatSources({
  sources,
  idPrefix,
  openId,
  variant = "inline",
  open = false,
  onToggle,
  summary,
  title = ASK.sourcesTitle,
  className,
}: ChatSourcesProps) {
  if (sources.length === 0) return null;
  if (variant === "panel") {
    return (
      <SourceRail
        sources={sources}
        idPrefix={idPrefix}
        active={openId}
        title={title}
        className={className}
      />
    );
  }
  return (
    <details
      data-testid={`fontes-inline-${idPrefix}`}
      open={open}
      onToggle={(e) => onToggle?.(e.currentTarget.open)}
      className={cx("group flex flex-col", className)}
    >
      <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-2 type-meta font-semibold text-link [&::-webkit-details-marker]:hidden">
        {summary ?? ASK.chat.sourcesCount(sources.length)}
        <Icon
          name="chevron-down"
          size={16}
          className="group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-(--dur-base) motion-safe:ease-(--ease-standard)"
        />
      </summary>
      <SourceRail
        sources={sources}
        idPrefix={idPrefix}
        active={openId}
        title={title}
        headingLevel={3}
        className="pt-2"
      />
    </details>
  );
}
