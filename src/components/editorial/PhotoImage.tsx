"use client";

import { useEffect, useRef, useState } from "react";

export interface PhotoImageProps {
  src: string;
  srcSet?: string;
  /** URL direta resolvida no servidor (manchete): tentada antes da rota. */
  directSrc?: string;
  directSrcSet?: string;
  alt: string;
  label: string;
  sizes: string;
  priority?: boolean;
  /** `contain`: imagem inteira, sem recorte (foto de terceiros, D-02: sem recorte de crédito). */
  fit?: "cover" | "contain";
}

const MARKER =
  "absolute inset-0 flex items-center justify-center p-2 text-center text-13 text-meta";

/** Marcador "Foto" da marca: sem foto, ou foto que não carregou (item 78). */
export function PhotoMarker({ alt, label }: { alt: string; label: string }) {
  return alt ? (
    <span role="img" aria-label={alt} className={MARKER}>
      {label}
    </span>
  ) : (
    <span aria-hidden="true" className={MARKER}>
      {label}
    </span>
  );
}

/**
 * `<img>` com reserva: URL direta (quando houver) → rota `/api/media` → marcador da marca. A falha
 * que acontece antes da hidratação (o evento `error` já passou) é pega no efeito por
 * `complete && naturalWidth === 0`.
 */
export function PhotoImage({
  src,
  srcSet,
  directSrc,
  directSrcSet,
  alt,
  label,
  sizes,
  priority,
  fit = "cover",
}: PhotoImageProps) {
  const [stage, setStage] = useState<"direct" | "route" | "failed">(directSrc ? "direct" : "route");
  const ref = useRef<HTMLImageElement>(null);
  const next = () => setStage((s) => (s === "direct" ? "route" : "failed"));

  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0 && img.currentSrc)
      setStage((s) => (s === "direct" ? "route" : "failed"));
  }, [stage]);

  if (stage === "failed") return <PhotoMarker alt={alt} label={label} />;
  const direct = stage === "direct";
  return (
    // `<img>` puro em vez de `next/image`: as fotos já saem sem otimizador (URL assinada de
    // /api/media), então o componente só somava ~9 kB de JS gz a toda página com foto (B-018).
    // As variantes por largura (item 79) chegam pelo `srcset` da rota.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      key={stage}
      src={direct ? directSrc : src}
      srcSet={direct ? directSrcSet : srcSet}
      sizes={sizes}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      onError={next}
      className={`absolute inset-0 size-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
    />
  );
}
