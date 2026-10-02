import { Fragment } from "react";
import { highlightSegments } from "@/lib/search/highlight";

export interface HighlightProps {
  text: string;
  /** Termos já sem acento (`queryTerms`). */
  terms: string[];
}

/**
 * Texto com os termos da busca em `<mark>` (P12). Só texto: o React escapa tudo, então HTML
 * vindo da consulta ou do acervo aparece como texto, nunca como marcação.
 *
 * ```tsx
 * <Highlight text={article.title} terms={queryTerms(q)} />
 * ```
 * - O destaque usa fundo e peso (não só cor).
 */
export function Highlight({ text, terms }: HighlightProps) {
  return (
    <>
      {highlightSegments(text, terms).map((s, i) =>
        s.mark ? (
          <mark key={i} className="rounded-xs bg-atencao-soft font-semibold text-strong">
            {s.text}
          </mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}
