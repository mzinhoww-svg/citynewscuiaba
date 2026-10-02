import Link from "next/link";
import { useId } from "react";
import type { ImageKind, PublicLabelInput } from "@/lib/labels";
import { PUBLIC_EXPLAIN } from "@/content/pt-BR/labels";
import { MADE_HOW } from "@/content/pt-BR/portal-card";
import { cx } from "../cx";

export interface MadeHowProps {
  /** Dados da matéria: de quantas fontes veio, quem revisou, qual a imagem. */
  article: PublicLabelInput & { image?: { kind: ImageKind; credit?: string } };
  /** Agente e versão de prompt que prepararam o texto, quando houve. */
  agentVersion?: string;
  versionsHref: string;
  /** Nível do título (padrão h2). */
  as?: "h2" | "h3";
  className?: string;
}

function originText(a: MadeHowProps["article"]): string {
  if (a.kind === "original") return PUBLIC_EXPLAIN.original;
  if (a.kind === "aggregated") return PUBLIC_EXPLAIN.aggregated;
  const n = a.sourceCount;
  return n !== undefined && Number.isInteger(n) && n > 0
    ? PUBLIC_EXPLAIN.derived(n)
    : PUBLIC_EXPLAIN.derivedOthers;
}

function reviewText(a: MadeHowProps["article"]): string | undefined {
  if (a.kind === "aggregated") return undefined;
  if (a.publishMode === "human") {
    return a.reviewer?.trim()
      ? PUBLIC_EXPLAIN.reviewedBy(a.reviewer.trim())
      : PUBLIC_EXPLAIN.reviewedNewsroom;
  }
  if (a.publishMode === "auto") return PUBLIC_EXPLAIN.reviewedAuto;
  return undefined;
}

function imageText(image: NonNullable<MadeHowProps["article"]["image"]>): string {
  switch (image.kind) {
    case "original":
      return PUBLIC_EXPLAIN.imageOriginal;
    case "reproduction":
      return PUBLIC_EXPLAIN.imageReproduction(image.credit);
    case "licensed":
      return PUBLIC_EXPLAIN.imageLicensed;
    case "illustrative":
      return PUBLIC_EXPLAIN.imageIllustrative;
    case "ai_generated":
      return PUBLIC_EXPLAIN.imageAi;
  }
}

/**
 * Bloco "Como esta matéria foi feita": em linguagem simples, de quantas fontes veio, quem
 * revisou e de onde vêm as imagens (spec 2026-10-02 §4.1), mais agente e link para o histórico
 * público de versões. Sem plaquetas: o texto carrega o sentido.
 *
 * ```tsx
 * <MadeHow article={article} versionsHref="/materia/x/historico" />
 * ```
 */
export function MadeHow({
  article,
  agentVersion,
  versionsHref,
  as: Heading = "h2",
  className,
}: MadeHowProps) {
  const id = useId();
  const review = reviewText(article);
  const rows: Array<{ title: string; text: string }> = [
    { title: PUBLIC_EXPLAIN.originTitle, text: originText(article) },
  ];
  if (review) rows.push({ title: PUBLIC_EXPLAIN.reviewTitle, text: review });
  if (article.image)
    rows.push({ title: PUBLIC_EXPLAIN.imageTitle, text: imageText(article.image) });
  const linkClass =
    "inline-flex min-h-tap items-center text-14 font-semibold text-link underline underline-offset-4 hover:text-strong";
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-4 bg-section p-5", className)}>
      <Heading id={id} className="type-section text-strong">
        {MADE_HOW.title}
      </Heading>
      <dl className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.title} className="flex flex-col gap-0.5">
            <dt className="type-label text-strong">{r.title}</dt>
            <dd className="type-body text-body">{r.text}</dd>
          </div>
        ))}
        {article.sponsored && (
          <div className="flex flex-col gap-0.5">
            <dt className="type-label text-strong">{PUBLIC_EXPLAIN.sponsoredTitle}</dt>
            <dd className="type-body text-body">{PUBLIC_EXPLAIN.sponsored}</dd>
          </div>
        )}
      </dl>
      {agentVersion && <p className="type-body text-body">{MADE_HOW.agent(agentVersion)}</p>}
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
