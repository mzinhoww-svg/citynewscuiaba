import { cx } from "../cx";

export interface SkeletonProps {
  /** Linhas de texto simuladas. */
  lines?: number;
  /** Bloco de imagem antes das linhas. */
  media?: boolean;
  className?: string;
}

/**
 * Esqueleto de carregamento (docs/screens.md, estado loading): blocos Névoa sem conteúdo,
 * pulso só sem `prefers-reduced-motion`. Quem envolve anuncia com `aria-busy` e texto oculto.
 *
 * ```tsx
 * <Skeleton lines={3} media />
 * ```
 */
export function Skeleton({ lines = 2, media = false, className }: SkeletonProps) {
  return (
    <div aria-hidden="true" className={cx("flex gap-4 motion-safe:animate-pulse", className)}>
      {media && <div className="size-24 shrink-0 rounded-md bg-section" />}
      <div className="flex flex-1 flex-col gap-2.5 py-1">
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            className={cx("h-4 bg-section", i === lines - 1 && lines > 1 ? "w-2/3" : "w-full")}
          />
        ))}
      </div>
    </div>
  );
}
