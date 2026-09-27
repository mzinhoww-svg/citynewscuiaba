import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";

export interface SectionHeaderProps {
  title: ReactNode;
  /** Texto da ação; `null` esconde. */
  action?: string | null;
  /** Destino da ação (link). */
  actionHref?: string;
  onAction?: () => void;
  eyebrow?: string;
  /** Nível do título (padrão h2). */
  as?: "h2" | "h3";
  /** Id do título, para `aria-labelledby` da seção. */
  id?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Abre cada seção do feed ("Explorar", "Mais lidas", "Agenda de hoje"): título Grotesk 20 bold
 * com "Ver tudo" opcional em Urucum Texto.
 *
 * ```tsx
 * <SectionHeader title="Explorar" actionHref="/explorar" />
 * <SectionHeader eyebrow="Agenda · fim de semana" title="O que fazer em Cuiabá" action={null} />
 * ```
 */
export function SectionHeader({
  title,
  action = UI.seeAll,
  actionHref,
  onAction,
  eyebrow,
  as: Heading = "h2",
  id,
  className,
  style,
}: SectionHeaderProps) {
  const actionClass =
    "inline-flex min-h-tap shrink-0 items-center text-14 font-semibold text-link underline-offset-4 hover:text-strong hover:underline";
  return (
    <div className={cx("flex items-end justify-between gap-4", className)} style={style}>
      <div className="flex flex-col gap-1.5">
        {eyebrow && <span className="type-eyebrow text-eyebrow">{eyebrow}</span>}
        <Heading id={id} className="type-section text-strong">
          {title}
        </Heading>
      </div>
      {action && actionHref && (
        <Link href={actionHref} className={actionClass}>
          {action}
        </Link>
      )}
      {action && !actionHref && onAction && (
        <button type="button" onClick={onAction} className={cx(actionClass, "cursor-pointer")}>
          {action}
        </button>
      )}
    </div>
  );
}
