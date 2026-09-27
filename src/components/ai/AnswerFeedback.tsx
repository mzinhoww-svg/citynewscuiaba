"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ASK } from "@/content/pt-BR/ask";
import { cx } from "../cx";

/** "Esta resposta ajudou?" (P13): Sim, Não e Reportar erro. Nada é enviado sem ação do leitor. */
export function AnswerFeedback({ reportHref = "/contato" }: { reportHref?: string }) {
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
    <div className="flex flex-wrap items-center gap-3">
      <span id={id} className="type-meta text-strong">
        {ASK.feedbackTitle}
      </span>
      <div role="group" aria-labelledby={id} className="flex gap-2">
        <button
          type="button"
          aria-pressed={vote === "yes"}
          onClick={() => setVote("yes")}
          className={button(vote === "yes")}
        >
          {ASK.yes}
        </button>
        <button
          type="button"
          aria-pressed={vote === "no"}
          onClick={() => setVote("no")}
          className={button(vote === "no")}
        >
          {ASK.no}
        </button>
      </div>
      <Link
        href={reportHref}
        className="inline-flex min-h-tap items-center text-14 font-semibold text-link underline underline-offset-4"
      >
        {ASK.report}
      </Link>
      <span aria-live="polite" className="type-meta text-meta">
        {vote && ASK.thanks}
      </span>
    </div>
  );
}
