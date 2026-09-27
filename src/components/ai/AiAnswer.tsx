import { useId, type ReactNode } from "react";
import { ASK } from "@/content/pt-BR/ask";
import { LABEL_TEXT } from "@/content/pt-BR/labels";
import type { AiAnswer as AiAnswerData, Claim } from "@/lib/ai/answer";
import { formatHour } from "@/lib/format/date";
import { cx } from "../cx";
import { ConfidenceMeter } from "../editorial/ConfidenceMeter";
import { OriginLabel } from "../editorial/OriginLabel";
import { Icon } from "../ui/Icon";
import { AnswerFeedback } from "./AnswerFeedback";
import { Citation } from "./Citation";

export interface AiAnswerProps {
  answer: Extract<AiAnswerData, { kind: "answer" }>;
  /** Prefixo dos ids da lista de fontes (alvo das citações). */
  sourceIdPrefix?: string;
  className?: string;
}

function Cites({ claim, prefix }: { claim: Claim; prefix: string }) {
  return (
    <>
      {claim.citations.map((i) => (
        <Citation key={i} n={i + 1} target={prefix} />
      ))}
    </>
  );
}

function Block({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="type-eyebrow text-meta">
        {title}
      </h3>
      {hint && <p className="type-meta text-meta">{hint}</p>}
      {children}
    </section>
  );
}

/**
 * Resposta da busca com IA (spec §5.5, P13): fatos com citação clicável em cada frase, inferência
 * rotulada, lacunas e conflitos em blocos separados, confiança, horário da consulta, aviso fixo
 * de que pode conter erros e "Esta resposta ajudou?".
 *
 * ```tsx
 * <AiAnswer answer={answer} />
 * ```
 * - Rótulo RESUMO POR IA sempre visível; inferência com borda tracejada e rótulo em texto.
 */
export function AiAnswer({ answer, sourceIdPrefix = "fonte", className }: AiAnswerProps) {
  const id = useId();
  return (
    <article
      aria-labelledby={id}
      className={cx("flex flex-col gap-5 border-l-2 border-ai bg-card-white py-1 pl-5", className)}
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <OriginLabel label={{ kind: "ai_summary", text: LABEL_TEXT.ai_summary }} />
          <h2 id={id} className="type-eyebrow text-ai">
            {ASK.aiGenerated}
          </h2>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ConfidenceMeter level={answer.confidence} />
          <time dateTime={answer.asOf} className="type-meta text-meta tabular-nums">
            {ASK.asOf(formatHour(answer.asOf))}
          </time>
        </p>
        {answer.confidence === "baixa" && (
          <p className="type-meta text-warn">{ASK.lowConfidence}</p>
        )}
      </header>

      <Block title={ASK.factsTitle}>
        <ul className="flex list-disc flex-col gap-2 pl-5 type-body-read text-strong">
          {answer.facts.map((f) => (
            <li key={f.text}>
              {f.text} <Cites claim={f} prefix={sourceIdPrefix} />
            </li>
          ))}
        </ul>
      </Block>

      {answer.inferences.length > 0 && (
        <Block title={ASK.inferencesTitle} hint={ASK.inferencesHint}>
          <ul className="flex flex-col gap-2 rounded-xs border border-dashed border-warn bg-atencao-soft px-4 py-3 type-body text-strong">
            {answer.inferences.map((f) => (
              <li key={f.text}>
                {f.text} <Cites claim={f} prefix={sourceIdPrefix} />
              </li>
            ))}
          </ul>
        </Block>
      )}

      {answer.conflicts.length > 0 && (
        <Block title={ASK.conflictsTitle}>
          {answer.conflicts.map((c) => (
            <div key={c.topic} className="flex flex-col gap-2 border-l-2 border-warn pl-4">
              <p className="type-body font-semibold text-strong">{c.topic}</p>
              <ul className="flex flex-col gap-1.5 type-body text-strong">
                {c.positions.map((p) => (
                  <li key={p.text} className="flex gap-2">
                    <Icon name="scale" size={16} className="mt-1 shrink-0 text-warn" />
                    <span>
                      {p.text} <Cites claim={p} prefix={sourceIdPrefix} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Block>
      )}

      {answer.gaps.length > 0 && (
        <Block title={ASK.gapsTitle}>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 type-body text-body">
            {answer.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Block>
      )}

      <p className="flex items-start gap-2 type-meta text-strong">
        <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0 text-ai" />
        {ASK.disclaimer}
      </p>
      <AnswerFeedback />
    </article>
  );
}
