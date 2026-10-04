import type { MouseEvent } from "react";
import { ASK } from "@/content/pt-BR/ask";
import { cx } from "../cx";

export interface CitationProps {
  /** Número da fonte como o leitor vê (1 = primeira fonte da lista). */
  n: number;
  /** Prefixo do id da lista de fontes (`fonte` → `#fonte-1`). */
  target?: string;
  /**
   * No chat (UI-T13): abre e rola até a fonte `n` em vez de só seguir a âncora. O link continua
   * com `href` (sem JavaScript, a âncora funciona).
   */
  onSelect?: (n: number) => void;
  className?: string;
}

/**
 * Citação clicável depois de uma frase da resposta da IA (P13): leva à fonte na lista.
 *
 * ```tsx
 * <Citation n={1} />
 * ```
 * - Nome acessível "Fonte 1"; visualmente, só o número em plaqueta (alvo de toque ampliado).
 */
export function Citation({ n, target = "fonte", onSelect, className }: CitationProps) {
  const onClick = onSelect
    ? (e: MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        onSelect(n);
      }
    : undefined;
  return (
    <a
      href={`#${target}-${n}`}
      aria-label={ASK.citedBy(n)}
      onClick={onClick}
      className={cx(
        "hit-area mx-0.5 inline-flex min-w-6 items-center justify-center rounded-xs border border-ai bg-ia-soft px-1 align-baseline font-sans text-13 font-semibold text-ai no-underline tabular-nums hover:bg-card-white",
        className,
      )}
    >
      {n}
    </a>
  );
}
