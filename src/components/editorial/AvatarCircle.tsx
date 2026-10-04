"use client";

import { useCallback, useState } from "react";
import { cx } from "../cx";

export interface AvatarCircleProps {
  /** Nome da fonte: vira o `alt` do logotipo e semeia a cor do monograma. */
  name: string;
  /** Logotipo (URL do bucket `source-logos`); sem ele, ou se a imagem falhar, monograma. */
  image?: string;
  /** Monograma de 2 letras da reserva. */
  mono: string;
  /** Classe de cor do monograma (`bg-avatar-N`). */
  monoBg: string;
  /** Tamanho e tipografia (`size-14 text-16`). */
  className?: string;
}

/**
 * Círculo de fonte (R27): o logotipo real entra inteiro (`object-contain`, com respiro para a
 * marca não ser cortada pela borda redonda) sobre fundo claro; o monograma é só reserva, quando
 * não há logotipo ou a imagem não carrega. O círculo é decorativo para leitores de tela (o nome
 * vem escrito ao lado); o `alt` fica para quando a imagem falha ou é copiada.
 */
export function AvatarCircle({ name, image, mono, monoBg, className }: AvatarCircleProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // Imagem que já falhou antes de a página hidratar: o `onError` não dispara, então confere aqui.
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setFailedSrc(img.getAttribute("src"));
  }, []);
  const showLogo = Boolean(image) && failedSrc !== image;
  const base = "relative flex shrink-0 items-center justify-center overflow-hidden rounded-pill";
  if (showLogo) {
    return (
      <span
        aria-hidden="true"
        data-testid="source-logo"
        className={cx(base, "border border-line-subtle bg-branco", className)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- logotipo pequeno do bucket público */}
        <img
          ref={ref}
          src={image}
          alt={name}
          loading="lazy"
          decoding="async"
          onError={() => setFailedSrc(image ?? null)}
          className="size-full object-contain p-1.5"
        />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className={cx(base, "font-bold text-branco", monoBg, className)}>
      {mono}
    </span>
  );
}
