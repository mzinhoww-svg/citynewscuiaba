import type { CSSProperties, ReactNode } from "react";
import { preload } from "react-dom";
import { UI } from "@/content/pt-BR/ui";
import { mediaSrcSet } from "@/lib/media/variants";
import { cx } from "../cx";
import { PhotoImage, PhotoMarker } from "./PhotoImage";

export interface PhotoProps {
  src?: string;
  /** Texto alternativo; vazio = decorativa. */
  alt?: string;
  /** Texto do marcador quando não há `src`. */
  label?: string;
  /** Proporção, ex.: "16/9", "3/2", 1. */
  ratio?: string | number;
  height?: number | string;
  /** Raio por token: web usa 0 (editorial), app usa lg/md. */
  radius?: "0" | "xs" | "md" | "lg" | "xl";
  /** `sizes` da imagem responsiva (o `srcset` 480/960/1440 sai da rota de mídia, item 79). */
  sizes?: string;
  /**
   * URL direta do Storage resolvida no servidor (só a manchete, para o LCP não passar pelo
   * redirecionamento da rota). Se falhar, a foto tenta a rota `src` e depois o substituto.
   */
  directSrc?: string;
  directSrcSet?: string;
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const RADIUS = {
  "0": "rounded-0",
  xs: "rounded-xs",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
} as const;

/**
 * Todo espaço de foto do CityNews: mostra a imagem em cover ou o marcador "Foto" da marca até
 * chegar a foto real da reportagem, ou quando a foto não carrega.
 *
 * ```tsx
 * <Photo src={story.image} alt={story.imageAlt} ratio="16/9" />
 * <Photo label="Foto da reportagem principal" height={240} />
 * ```
 * - O marcador é decorativo. Rótulo e crédito da imagem ficam fora, em `OriginLabel`/legenda.
 */
export function Photo({
  src,
  alt = "",
  label = UI.photo,
  ratio,
  height,
  radius = "lg",
  sizes = "(min-width: 64em) 50vw, 100vw",
  directSrc,
  directSrcSet,
  priority,
  className,
  style,
  children,
}: PhotoProps) {
  const srcSet = src ? mediaSrcSet(src) : undefined;
  if (src && priority) {
    const first = directSrc ?? src;
    const firstSet = directSrc ? directSrcSet : srcSet;
    preload(first, {
      as: "image",
      fetchPriority: "high",
      ...(firstSet ? { imageSrcSet: firstSet, imageSizes: sizes } : {}),
    });
  }
  return (
    <div
      className={cx("relative shrink-0 overflow-hidden bg-photo", RADIUS[radius], className)}
      style={{ aspectRatio: ratio, height, ...style }}
    >
      {src ? (
        // Falha de carregamento troca para o marcador (item 78); `priority` vira preload +
        // `fetchpriority=high`, só na manchete.
        <PhotoImage
          key={directSrc ?? src}
          src={src}
          srcSet={srcSet}
          directSrc={directSrc}
          directSrcSet={directSrcSet}
          alt={alt}
          label={label}
          sizes={sizes}
          priority={priority}
        />
      ) : (
        <PhotoMarker alt={alt} label={label} />
      )}
      {children}
    </div>
  );
}
