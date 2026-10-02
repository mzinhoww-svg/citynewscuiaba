import type { ReactNode } from "react";
import { cx } from "../cx";

export interface CategoryTagProps {
  children?: ReactNode;
  /** text = eyebrow em caixa alta · pill = etiqueta sobre foto · label = plaqueta branca (redes) */
  variant?: "text" | "pill" | "label";
  /** service (Cerrado) para Guia, serviços e utilidade pública */
  tone?: "news" | "service";
  className?: string;
}

/**
 * Marca de editoria acima da manchete ("CIDADE", "MOBILIDADE") ou em pílula sobre a foto.
 *
 * ```tsx
 * <CategoryTag>Cidade</CategoryTag>
 * <CategoryTag variant="pill">Política</CategoryTag>
 * <CategoryTag tone="service">Guia</CategoryTag>
 * ```
 * - `tone="service"` (Cerrado) para Guia, serviços e utilidade pública.
 * - Pílula de notícia: Urgente com texto Tinta (5,05:1, R14); branco sobre Urucum reprova AA.
 */
export function CategoryTag({
  children,
  variant = "text",
  tone = "news",
  className,
}: CategoryTagProps) {
  if (variant === "pill") {
    return (
      <span
        className={cx(
          "inline-flex h-6.5 items-center rounded-pill px-3 text-12 font-semibold leading-none",
          tone === "service" ? "bg-cerrado text-branco" : "bg-urgente text-tinta",
          className,
        )}
      >
        {children}
      </span>
    );
  }
  if (variant === "label") {
    return (
      <span
        className={cx(
          "inline-flex h-5.5 items-center bg-branco px-2.5 type-eyebrow text-tinta",
          className,
        )}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={cx(
        "type-eyebrow",
        tone === "service" ? "text-service" : "text-eyebrow",
        className,
      )}
    >
      {children}
    </span>
  );
}
