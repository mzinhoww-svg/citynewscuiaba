import Link from "next/link";
import { useId } from "react";
import type { ArticleImage, ArticleSummary } from "@/lib/db/queries/types";
import { formatWhen } from "@/lib/format/date";
import { CARD } from "@/content/pt-BR/portal-card";
import { SECTION_ICONS } from "@/content/pt-BR/explore";
import { LABEL_TEXT } from "@/content/pt-BR/labels";
import { publicImageCaption, publicLabels } from "@/lib/labels";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";
import { CategoryTag } from "./CategoryTag";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { MetaRow } from "./MetaRow";
import { OriginLabel } from "./OriginLabel";
import { ImageCaption } from "./ImageCaption";
import { Photo } from "./Photo";

export interface ArticleCardProps {
  article: ArticleSummary;
  /** lead = manchete · standard = grade com foto 3:2 · compact e list = linha com miniatura (foto ou tipográfica) */
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

/** Editorias de serviço usam o Cerrado; as demais, o Urucum (DESIGN.md: pouca quantidade). */
const SERVICE_SECTIONS: readonly string[] = ["servicos", "guia-cuiaba"];

/** Ícone da editoria (sprite existente); editoria sem ícone mapeado usa o padrão neutro. */
function sectionIcon(slug: string): IconName {
  return SECTION_ICONS[slug] ?? "newspaper";
}

/** Tamanho fixo da miniatura (CLS zero): compact 80, list e standard sem foto 96. */
const THUMB = { compact: "size-20", list: "size-24", standard: "size-20" } as const;

/**
 * Sem imagem aprovada, nunca bloco chapado nem foto genérica (spec 2026-10-02 §4.3):
 * - `header` (lead): faixa fina da editoria + ícone + nome, altura de texto (48 px, ≤ 96);
 * - `thumb` (standard, list, compact): miniatura Névoa com o ícone da editoria, decorativa.
 */
function TypographicCover({
  section,
  mode,
  thumb,
  className,
}: {
  section: { slug: string; name: string };
  mode: "header" | "thumb";
  thumb?: keyof typeof THUMB;
  className?: string;
}) {
  const icon = <Icon name={sectionIcon(section.slug)} size={mode === "header" ? 20 : 24} />;
  if (mode === "header") {
    return (
      <div
        data-testid="typographic-cover"
        data-cover="header"
        className={cx(
          "flex h-12 w-full items-center gap-2 border-t-4 bg-section px-4 text-strong",
          SERVICE_SECTIONS.includes(section.slug) ? "border-cerrado" : "border-urucum",
          className,
        )}
      >
        {icon}
        <span className="type-eyebrow">{section.name}</span>
      </div>
    );
  }
  return (
    <div
      data-testid="typographic-cover"
      data-cover="thumb"
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-center justify-center rounded-md bg-section text-meta",
        THUMB[thumb ?? "list"],
        className,
      )}
      style={{ aspectRatio: 1 }}
    >
      {icon}
    </div>
  );
}

/** Foto aprovada com proporção fixa; em miniatura o texto acessível inclui a origem de terceiros. */
function CardPhoto({
  image,
  variant,
}: {
  image: ArticleImage;
  variant: "lead" | "standard" | "compact" | "list";
}) {
  const thumb = variant === "compact" || variant === "list";
  const caption = image.kind === "reproduction" ? publicImageCaption(image.kind, image.credit) : "";
  const alt = thumb && caption ? (image.alt ? `${image.alt}. ${caption}` : caption) : image.alt;
  return (
    <Photo
      src={image.src}
      alt={alt}
      ratio={variant === "lead" ? "16/9" : variant === "standard" ? "3/2" : 1}
      radius={thumb ? "md" : "0"}
      priority={variant === "lead"}
      sizes={
        thumb
          ? "6rem"
          : variant === "lead"
            ? "(min-width: 64em) 60vw, 100vw"
            : "(min-width: 64em) 30vw, 100vw"
      }
      className={thumb ? THUMB[variant] : "w-full"}
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
  const image = article.image;
  /* Linha com miniatura: list, compact e standard sem foto (foto 3:2 só com imagem aprovada). */
  const row = variant === "list" || variant === "compact" || (variant === "standard" && !image);
  const headerCover = lead && !image;
  const caption = image?.kind === "reproduction" && !row ? image : undefined;
  const SummaryHeading = Heading === "h1" ? "h2" : "p";

  const text = (
    <div className={cx("flex min-w-0 flex-1 flex-col", lead ? "gap-3" : "gap-2")}>
      {!headerCover && <CategoryTag>{article.section.name}</CategoryTag>}
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
          className="relative mt-1 hidden flex-col gap-2 border-l-2 border-ai bg-ia-soft px-4 py-3 lg:flex"
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

  const thumbSize = variant === "lead" ? "list" : variant;
  const media = image ? (
    <div className={cx(row ? "contents" : "order-1 w-full")}>
      <CardPhoto image={image} variant={variant === "standard" && row ? "list" : variant} />
    </div>
  ) : headerCover ? (
    <TypographicCover section={article.section} mode="header" className="order-1" />
  ) : (
    <TypographicCover section={article.section} mode="thumb" thumb={thumbSize} />
  );

  return (
    <article
      className={cx(
        "relative flex",
        row ? "flex-row gap-3.5" : "flex-col",
        variant === "list" && "border-b border-line-subtle py-4",
        variant === "compact" && "border-t border-line-subtle pt-3",
        lead ? "gap-5" : variant === "standard" && !row ? "gap-3.5" : undefined,
        "[--card-radius:var(--r-0)]",
        className,
      )}
    >
      {media}
      <div className={cx("flex min-w-0 flex-1 flex-col", !row && "order-3")}>{text}</div>
      {caption && (
        <div className="order-2">
          <ImageCaption image={caption} />
        </div>
      )}
    </article>
  );
}
