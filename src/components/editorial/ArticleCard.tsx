import Link from "next/link";
import { useId } from "react";
import type { ArticleSummary } from "@/lib/db/queries/types";
import { formatWhen } from "@/lib/format/date";
import { CARD } from "@/content/pt-BR/portal-card";
import { LABEL_TEXT } from "@/content/pt-BR/labels";
import { publicLabels } from "@/lib/labels";
import { cx } from "../cx";
import { CategoryTag } from "./CategoryTag";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { MetaRow } from "./MetaRow";
import { OriginLabel } from "./OriginLabel";
import { Photo } from "./Photo";

export interface ArticleCardProps {
  article: ArticleSummary;
  /** lead = manchete · standard = grade com foto · compact = sem foto · list = linha com miniatura */
  variant?: "lead" | "standard" | "compact" | "list";
  /** Nível do título (padrão h3; a manchete da home usa h1). */
  as?: "h1" | "h2" | "h3";
  /** Referência de "agora" para datas relativas (testes). */
  now?: Date;
  className?: string;
}

/* Escala de manchete (spec 2026-10-02 §4.3): lead 28→44, standard 20→22, list e compact 18. */
const HEADLINE = {
  lead: "type-headline-xl",
  standard: "type-headline",
  compact: "type-headline-md",
  list: "type-headline-md",
} as const;

/** Sem imagem aprovada: card tipográfico da editoria (spec §4), nunca foto genérica. */
function TypographicCover({ section, className }: { section: string; className?: string }) {
  return (
    <div
      data-testid="typographic-cover"
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-end bg-tinta p-4 font-sans font-black leading-tight text-branco",
        className,
      )}
    >
      <span className="flex items-center gap-2 text-20">
        <span className="size-2 shrink-0 rounded-pill bg-urucum" />
        {section}
      </span>
    </div>
  );
}

function Cover({
  article,
  variant,
}: {
  article: ArticleSummary;
  variant: "lead" | "standard" | "list";
}) {
  const ratio = variant === "lead" ? "16/9" : variant === "standard" ? "3/2" : 1;
  const size = variant === "list" ? "size-24" : "w-full";
  if (article.image) {
    return (
      <Photo
        src={article.image.src}
        alt={article.image.alt}
        ratio={ratio}
        radius={variant === "list" ? "md" : "0"}
        priority={variant === "lead"}
        sizes={
          variant === "lead" ? "(min-width: 64em) 60vw, 100vw" : "(min-width: 64em) 30vw, 100vw"
        }
        className={size}
      />
    );
  }
  return (
    <TypographicCover
      section={article.section.name}
      className={cx(
        size,
        variant === "lead"
          ? "aspect-[2/1] lg:aspect-video"
          : variant === "standard"
            ? "aspect-3/2"
            : "rounded-md",
      )}
    />
  );
}

/**
 * Card de matéria do CityNews em quatro variantes. O título é o link (R7) e o card inteiro é
 * clicável pelo pseudo-elemento; mostra no máximo 1 plaqueta (ORIGINAL CITYNEWS) e, em texto,
 * a origem do texto derivado e a revisão (DESIGN.md §5; `publicLabels`).
 *
 * ```tsx
 * <ArticleCard variant="lead" as="h1" article={home.lead} />
 * <ArticleCard variant="compact" article={item} />
 * ```
 * - Os detalhes de origem ficam no bloco "Como esta matéria foi feita" da matéria.
 * - Sem contagem de curtidas ou comentários (R8): fontes e tempo de leitura.
 */
export function ArticleCard({
  article,
  variant = "standard",
  as: Heading = "h3",
  now,
  className,
}: ArticleCardProps) {
  const summaryId = useId();
  const pub = publicLabels(article);
  const when = formatWhen(article.publishedAt, now);
  const lead = variant === "lead";
  const list = variant === "list";
  const SummaryHeading = Heading === "h1" ? "h2" : "p";

  const text = (
    <div className={cx("flex min-w-0 flex-1 flex-col", lead ? "gap-3" : "gap-2")}>
      <CategoryTag>{article.section.name}</CategoryTag>
      <Heading className={cx(HEADLINE[variant], "text-strong", !lead && "line-clamp-3")}>
        <Link href={article.href} className="card-link no-underline">
          {article.title}
        </Link>
      </Heading>
      {(lead || variant === "standard") && (
        <p className={cx("text-body", lead ? "type-body-read" : "type-body line-clamp-2")}>
          {article.dek}
        </p>
      )}
      {pub.plaque === "original" && (
        <div className="relative flex">
          <OriginLabel label={{ kind: "original", text: LABEL_TEXT.original }} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {lead && <ConfidenceMeter level={article.confidence.level} />}
        <MetaRow
          className="flex-wrap"
          author={lead ? CARD.by(article.byline) : undefined}
          originText={pub.originText}
          reviewText={pub.reviewText}
          sponsoredText={pub.sponsoredText}
          readMinutes={lead ? article.readMinutes : undefined}
          time={when}
        />
      </div>
      {lead && article.aiSummary && (
        <section
          aria-labelledby={summaryId}
          className="relative mt-1 flex flex-col gap-2 border-l-2 border-ai bg-ia-soft px-4 py-3"
        >
          <SummaryHeading id={summaryId} className="type-eyebrow text-ai">
            {CARD.summary20s}
          </SummaryHeading>
          <ul className="flex list-disc flex-col gap-1 pl-5 type-body text-strong">
            {article.aiSummary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );

  return (
    <article
      className={cx(
        "relative flex",
        list ? "flex-row gap-3.5 border-b border-line-subtle py-4" : "flex-col",
        lead ? "gap-5" : variant === "standard" ? "gap-3.5" : "gap-2",
        variant === "compact" && "border-t border-line-subtle pt-3",
        "[--card-radius:var(--r-0)]",
        className,
      )}
    >
      {/* Na linha sem foto aprovada, a miniatura tipográfica cortaria o nome da editoria: some. */}
      {variant !== "compact" && !(list && !article.image) && (
        <Cover article={article} variant={variant} />
      )}
      {text}
    </article>
  );
}
