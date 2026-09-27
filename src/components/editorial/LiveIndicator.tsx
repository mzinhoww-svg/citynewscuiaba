import { cx } from "../cx";

export interface LiveIndicatorProps {
  label?: string;
  /** Pulso suave do ponto; para com `prefers-reduced-motion`. */
  pulse?: boolean;
  /** Texto branco sobre Tinta ou foto. */
  inverse?: boolean;
  className?: string;
}

/**
 * "O Ponto" reaproveitado como indicador de ao vivo ou atualização: ponto Urucum + rótulo em
 * caixa alta. Cabeçalho do site ("● AGORA"), tarjas de vídeo, coberturas ao vivo.
 *
 * ```tsx
 * <LiveIndicator />                                   // ● AGORA
 * <LiveIndicator label="Agora · CityNews Cuiabá" inverse />
 * ```
 * - O ponto é decorativo; o texto carrega o sentido (nada depende só de cor).
 */
export function LiveIndicator({
  label = "Agora",
  pulse = true,
  inverse = false,
  className,
}: LiveIndicatorProps) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 type-eyebrow",
        inverse ? "text-branco" : "text-strong",
        className,
      )}
    >
      <span aria-hidden="true" className="relative size-2 shrink-0">
        <span className="absolute inset-0 rounded-pill bg-urucum" />
        {pulse && (
          <span className="absolute -inset-1 rounded-pill bg-urucum opacity-25 motion-safe:animate-live-pulse motion-reduce:hidden" />
        )}
      </span>
      {label}
    </span>
  );
}
