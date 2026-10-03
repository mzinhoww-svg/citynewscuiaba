"use client";

import { useId, useState } from "react";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { cx } from "../cx";

export interface AiSummaryBlockProps {
  items: string[];
  className?: string;
}

/**
 * "Resumo em poucos segundos" da matéria (P03), sem rótulo de origem do texto nem rodapé de
 * revisão (spec 2026-10-03 R16): só os itens e "Foi útil?".
 *
 * ```tsx
 * <AiSummaryBlock items={article.aiSummary} />
 * ```
 */
export function AiSummaryBlock({ items, className }: AiSummaryBlockProps) {
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
      className={cx(
        "flex flex-col gap-3 border-l-2 border-line-strong bg-section px-5 py-4",
        className,
      )}
    >
      <h2 id={id} className="type-eyebrow text-strong">
        {ARTICLE.aiTitle}
      </h2>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body text-strong">
        {items.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
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
