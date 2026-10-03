import type { ArticleImage } from "@/lib/db/queries/types";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { PUBLIC_LABEL } from "@/content/pt-BR/labels";
import { cx } from "../cx";
import { ImageCaption } from "./ImageCaption";
import { Photo } from "./Photo";

export interface ArticleFigureProps {
  image: ArticleImage;
  /** Prefixo da legenda de reprodução. */
  captionPrefix?: string;
  /** Capa: carrega com prioridade (LCP). A imagem do texto carrega só perto da tela. */
  priority?: boolean;
  className?: string;
}

/**
 * Foto da matéria (capa ou imagem do texto) com a legenda de reprodução. A caixa da foto tem
 * proporção fixa (sem salto de layout) e a legenda (colada, 8 px abaixo), o crédito com o nome do
 * veículo e "Ver original" ficam fora dela, sem recorte (spec 2026-10-02 §4.10). Sem texto alternativo escrito, usa "Imagem de {Fonte}
 * sobre a matéria": a imagem nunca fica muda para leitor de tela.
 *
 * ```tsx
 * <ArticleFigure image={a.image} priority />
 * <ArticleFigure image={a.inlineImage} />
 * ```
 */
export function ArticleFigure({
  image,
  captionPrefix = PUBLIC_LABEL.image.reproduction,
  priority,
  className,
}: ArticleFigureProps) {
  const alt = image.alt.trim() || ARTICLE.figureAlt(image.credit);
  return (
    <figure className={cx("flex flex-col", className)}>
      <Photo
        src={image.src}
        alt={alt}
        ratio="16/9"
        radius="0"
        priority={priority}
        sizes="(min-width: 64em) 60vw, 100vw"
        className="w-full"
      />
      <ImageCaption image={image} prefix={captionPrefix} as="figcaption" className="mt-2" />
    </figure>
  );
}
