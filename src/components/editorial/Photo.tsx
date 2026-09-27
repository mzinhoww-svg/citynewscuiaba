import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";

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
  /** `sizes` da imagem responsiva. */
  sizes?: string;
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
 * chegar a foto real da reportagem.
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
  priority,
  className,
  style,
  children,
}: PhotoProps) {
  return (
    <div
      className={cx("relative shrink-0 overflow-hidden bg-photo", RADIUS[radius], className)}
      style={{ aspectRatio: ratio, height, ...style }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized
          className="object-cover"
        />
      ) : alt ? (
        <span
          role="img"
          aria-label={alt}
          className="absolute inset-0 flex items-center justify-center p-2 text-center text-13 text-meta"
        >
          {label}
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center p-2 text-center text-13 text-meta"
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
