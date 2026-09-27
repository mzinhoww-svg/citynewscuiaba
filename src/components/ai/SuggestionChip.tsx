import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "../cx";

export interface SuggestionChipProps {
  href: string;
  children: ReactNode;
  /** ai = pergunta para a IA · neutral = outro caminho (busca, pauta). */
  tone?: "ai" | "neutral";
  className?: string;
}

/**
 * Sugestão de próxima pergunta ou caminho (P13: refinamentos, recusa e falha).
 *
 * ```tsx
 * <SuggestionChip href="/pergunte?q=...">O que aconteceu hoje?</SuggestionChip>
 * ```
 * - Link sem prefetch: abrir a pergunta consome o limite de uso só quando o leitor clica.
 */
export function SuggestionChip({ href, children, tone = "ai", className }: SuggestionChipProps) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cx(
        "inline-flex min-h-tap items-center rounded-pill border px-4 py-2 text-14 no-underline",
        tone === "ai"
          ? "border-ai bg-ia-soft text-ai hover:bg-card-white"
          : "border-line-control bg-card-white text-strong hover:bg-section",
        className,
      )}
    >
      {children}
    </Link>
  );
}
