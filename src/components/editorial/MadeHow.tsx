import Link from "next/link";
import { useId } from "react";
import type { Label } from "@/lib/labels";
import { LABEL_EXPLAIN } from "@/content/pt-BR/labels";
import { MADE_HOW } from "@/content/pt-BR/portal-card";
import { cx } from "../cx";
import { OriginLabel } from "./OriginLabel";

export interface MadeHowProps {
  labels: { shown: Label[]; hidden: Label[] };
  reviewer?: string;
  /** Agente e versão de prompt que prepararam o texto, quando houve. */
  agentVersion?: string;
  versionsHref: string;
  /** Nível do título (padrão h2). */
  as?: "h2" | "h3";
  className?: string;
}

/**
 * Bloco "Como esta matéria foi feita": todos os rótulos (inclusive os que não couberam no
 * card) com explicação, revisor, agente e link para o histórico público de versões.
 *
 * ```tsx
 * <MadeHow labels={article.labels} reviewer="Marina Couto" versionsHref="/materia/x/historico" />
 * ```
 */
export function MadeHow({
  labels,
  reviewer,
  agentVersion,
  versionsHref,
  as: Heading = "h2",
  className,
}: MadeHowProps) {
  const id = useId();
  const all = [...labels.shown, ...labels.hidden];
  const linkClass =
    "inline-flex min-h-tap items-center text-14 font-semibold text-link underline underline-offset-4 hover:text-strong";
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-4 bg-section p-5", className)}>
      <Heading id={id} className="type-section text-strong">
        {MADE_HOW.title}
      </Heading>
      <ul className="flex flex-col gap-3">
        {all.map((l) => (
          <li key={`${l.kind}-${l.detail ?? ""}`} className="flex flex-col items-start gap-1.5">
            <OriginLabel label={l} size="md" />
            <p className="type-body text-body">{LABEL_EXPLAIN[l.kind]}</p>
          </li>
        ))}
      </ul>
      {(reviewer || agentVersion) && (
        <div className="flex flex-col gap-1 type-body text-body">
          {reviewer && <p>{MADE_HOW.reviewedBy(reviewer)}</p>}
          {agentVersion && <p>{MADE_HOW.agent(agentVersion)}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-x-6">
        <Link href={versionsHref} className={linkClass}>
          {MADE_HOW.versions}
        </Link>
        <Link href={MADE_HOW.methodologyHref} className={linkClass}>
          {MADE_HOW.methodology}
        </Link>
      </div>
    </section>
  );
}
