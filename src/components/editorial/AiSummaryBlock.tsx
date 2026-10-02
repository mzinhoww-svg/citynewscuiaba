"use client";

import { useId, useState } from "react";
import { LABEL_TEXT } from "@/content/pt-BR/labels";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { cx } from "../cx";
import { OriginLabel } from "./OriginLabel";

export interface AiSummaryBlockProps {
  items: string[];
  /** Nome de quem revisou o resumo; sem revisor, o bloco diz isso com todas as letras. */
  reviewer?: string;
  className?: string;
}

/**
 * "Resumo em poucos segundos" da matéria (P03): rótulo RESUMO POR IA sempre visível, revisor
 * (ou aviso de que ainda não houve revisão humana) e "Foi útil?".
 *
 * ```tsx
 * <AiSummaryBlock items={article.aiSummary} reviewer={article.reviewer} />
 * ```
 */
export function AiSummaryBlock({ items, reviewer, className }: AiSummaryBlockProps) {
  const id = useId();
  const [vote, setVote] = useState<"yes" | "no" | null>(null);
  const button = (active: boolean) =>
    cx(
      "inline-flex min-h-tap min-w-tap cursor-pointer items-center justify-center rounded-pill border px-4 text-14 font-semibold",
      active
        ? "border-transparent bg-action-primary text-on-inverse"
        : "border-line-control bg-card-white text-strong hover:bg-section",
    );
  return (
    <section
      aria-labelledby={id}
      className={cx("flex flex-col gap-3 border-l-2 border-ai bg-ia-soft px-5 py-4", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <OriginLabel label={{ kind: "ai_summary", text: LABEL_TEXT.ai_summary }} />
        <h2 id={id} className="type-eyebrow text-ai">
          {ARTICLE.aiTitle}
        </h2>
      </div>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body text-strong">
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="type-meta text-meta">
        {reviewer ? ARTICLE.aiReviewed(reviewer) : ARTICLE.aiNotReviewed}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span id={`${id}-util`} className="type-meta text-strong">
          {ARTICLE.aiUseful}
        </span>
        <div role="group" aria-labelledby={`${id}-util`} className="flex gap-2">
          <button
            type="button"
            aria-pressed={vote === "yes"}
            onClick={() => setVote("yes")}
            className={button(vote === "yes")}
          >
            {ARTICLE.yes}
          </button>
          <button
            type="button"
            aria-pressed={vote === "no"}
            onClick={() => setVote("no")}
            className={button(vote === "no")}
          >
            {ARTICLE.no}
          </button>
        </div>
        <span aria-live="polite" className="type-meta text-meta">
          {vote && ARTICLE.thanks}
        </span>
      </div>
    </section>
  );
}
