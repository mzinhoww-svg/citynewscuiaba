import type { ArticleImage } from "@/lib/db/queries/types";
import { CARD } from "@/content/pt-BR/portal-card";
import { publicImageCaption } from "@/lib/labels";
import { cx } from "../cx";
import { VisuallyHidden } from "../ui/VisuallyHidden";

/**
 * Legenda da foto de terceiros, sempre fora da área recortada: "Reprodução web · Fonte", crédito do
 * autor quando houver e o link "Ver original" para a página da fonte (regra 11 do CLAUDE.md).
 */
export function ImageCaption({
  image,
  prefix,
  as: Tag = "p",
  className,
}: {
  image: ArticleImage;
  /** Texto antes da fonte quando a foto é reprodução (padrão: "Reprodução web"). */
  prefix?: string;
  as?: "p" | "figcaption";
  className?: string;
}) {
  const caption =
    image.kind === "reproduction" && prefix
      ? [prefix, image.credit?.trim()].filter(Boolean).join(" · ")
      : publicImageCaption(image.kind, image.credit);
  return (
    <Tag
      className={cx(
        "relative flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-meta",
        className,
      )}
    >
      <span>
        {caption}
        {image.author ? ` · ${CARD.photoBy(image.author)}` : ""}
      </span>
      {image.originUrl && (
        <a
          href={image.originUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-tap items-center underline"
        >
          {CARD.viewOriginal}
          <VisuallyHidden> ({CARD.newTab})</VisuallyHidden>
        </a>
      )}
    </Tag>
  );
}
