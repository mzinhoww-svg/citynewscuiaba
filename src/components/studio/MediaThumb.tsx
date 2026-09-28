"use client";

import Image from "next/image";
import { useState } from "react";
import { MEDIA_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface MediaThumbProps {
  src: string;
  alt: string;
  className?: string;
}

/**
 * Prévia de imagem do acervo no Estúdio. Sem bytes (Storage indisponível ou arquivo removido),
 * mostra o marcador "Prévia indisponível" em vez de imagem quebrada.
 */
export function MediaThumb({ src, alt, className }: MediaThumbProps) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cx("relative aspect-[3/2] overflow-hidden rounded-md bg-photo", className)}>
      {failed ? (
        <span
          role="img"
          aria-label={`${alt} · ${T.noPreview}`}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-13 text-meta"
        >
          <Icon name="camera" size={20} />
          {T.noPreview}
        </span>
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes="(min-width: 64em) 20vw, 50vw"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
