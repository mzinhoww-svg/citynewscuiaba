import Link from "next/link";
import { useId } from "react";
import type { ImageKind, PublicLabelInput } from "@/lib/labels";
import { PUBLIC_EXPLAIN } from "@/content/pt-BR/labels";
import { MADE_HOW } from "@/content/pt-BR/portal-card";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface MadeHowProps {
  /** Dados da matéria: de quantas fontes veio, quem revisou, qual a imagem. */
  article: PublicLabelInput & { image?: { kind: ImageKind; credit?: string } };
  /** Agente e versão de prompt que prepararam o texto, quando houve. */
  agentVersion?: string;
  versionsHref: string;
  /** Nível do título (padrão h2). */
  as?: "h2" | "h3";
  /** Recolhível: fechado no celular, aberto de 1024 px em diante. */
  collapsible?: boolean;
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
  collapsible = false,
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
  const title = (
    <Heading id={id} className="type-section text-strong">
      {MADE_HOW.title}
    </Heading>
  );
  const body = (
    <>
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
    </>
  );
  if (collapsible) {
    // Celular: <details> recolhido. Desktop (lg): painel aberto. Os dois vêm no HTML do servidor
    // e o CSS escolhe, sem salto de layout e sem depender de JavaScript.
    return (
      <>
        <section aria-labelledby={id} className={cx("bg-section lg:hidden", className)}>
          <details className="group flex flex-col">
            <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
              {title}
              <Icon
                name="chevron-down"
                size={20}
                className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div className="flex flex-col gap-4 px-5 pb-5">{body}</div>
          </details>
        </section>
        <section
          aria-labelledby={`${id}-wide`}
          className={cx("hidden flex-col gap-4 bg-section p-5 lg:flex", className)}
        >
          <Heading id={`${id}-wide`} className="type-section text-strong">
            {MADE_HOW.title}
          </Heading>
          {body}
        </section>
      </>
    );
  }
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-4 bg-section p-5", className)}>
      {title}
      {body}
    </section>
  );
}
