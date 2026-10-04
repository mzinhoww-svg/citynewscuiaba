import { cx } from "../cx";

const PULSE = "motion-safe:animate-pulse";

const ROUND = {
  none: "",
  md: "rounded-md",
  lg: "rounded-lg",
  pill: "rounded-pill",
} as const;

export interface SkeletonProps {
  /**
   * Forma (item 44):
   * - `text` (padrão): `lines` linhas de texto, com bloco de imagem opcional (`media`);
   * - `line`: uma barra da altura de uma linha de texto; a largura vem de `className` (`w-1/2`);
   * - `block`: bloco livre (título, foto, avatar, número); dimensões em `className`, raio em `round`;
   * - `card`: cartão branco com borda e `rows` itens de `lines` linhas cada.
   */
  shape?: "text" | "line" | "block" | "card";
  /** Linhas de texto simuladas (`text`, e por item em `card`). */
  lines?: number;
  /** Bloco de imagem antes das linhas (`text` e `card`). */
  media?: boolean;
  /** Itens do cartão (`card`). */
  rows?: number;
  /** Raio do `block`. */
  round?: keyof typeof ROUND;
  className?: string;
}

function TextLines({
  lines,
  media,
  className,
}: {
  lines: number;
  media: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cx("flex gap-4", PULSE, className)}>
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

/**
 * Esqueleto de carregamento (docs/screens.md, estado loading): blocos Névoa sem conteúdo,
 * pulso só sem `prefers-reduced-motion`. Sempre decorativo (`aria-hidden`): quem envolve
 * anuncia com `aria-busy` e texto oculto. Nenhum `loading.tsx` desenha esqueleto à mão.
 *
 * ```tsx
 * <Skeleton lines={3} media />
 * <Skeleton shape="line" className="w-1/2" />
 * <Skeleton shape="block" className="h-9 w-48" />
 * <Skeleton shape="block" round="pill" className="size-16 shrink-0" />
 * <Skeleton shape="card" rows={6} lines={2} />
 * ```
 */
export function Skeleton({
  shape = "text",
  lines = 2,
  media = false,
  rows = 1,
  round = "none",
  className,
}: SkeletonProps) {
  if (shape === "line") {
    return <div aria-hidden="true" className={cx("h-4 bg-section", PULSE, className)} />;
  }
  if (shape === "block") {
    return <div aria-hidden="true" className={cx("bg-section", ROUND[round], PULSE, className)} />;
  }
  if (shape === "card") {
    return (
      <div
        aria-hidden="true"
        className={cx(
          "flex flex-col gap-3 rounded-lg border border-line-section bg-card-white p-4",
          className,
        )}
      >
        {Array.from({ length: rows }, (_, i) => (
          <TextLines key={i} lines={lines} media={media} />
        ))}
      </div>
    );
  }
  return <TextLines lines={lines} media={media} className={className} />;
}
