import type { CSSProperties } from "react";
import { cx } from "../cx";
import type { IconName } from "./icon-names";

export type { IconName };

export interface IconProps {
  name: IconName;
  /** 16 em metadados, 20 em botões e linhas de lista, 24 em navegação e campos. */
  size?: 14 | 16 | 18 | 20 | 22 | 24;
  strokeWidth?: number;
  /** Cor CSS (use `var(--token)`); o padrão herda a cor do texto. */
  color?: string;
  /** Estado ativo preenchido (bookmark, heart): passe `currentColor`. */
  fill?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Ícone de contorno usado em toda a interface do CityNews (navegação, metadados, campos);
 * geometria Lucide com traço 1,5.
 *
 * ```tsx
 * <Icon name="search" size={24} color="var(--text-placeholder)" />
 * <Icon name="bookmark" fill="currentColor" />
 * ```
 * - `size` 16 em linhas de metadado, 20 em botões, 24 em navegação e campos.
 * - Estado ativo preenchido: passe `fill` (bookmark). Nunca use emoji como ícone.
 * - Sempre decorativo (`aria-hidden`): o nome acessível fica no controle que o contém.
 * - A geometria vem do sprite inline (`IconSprite`, renderizado uma vez no layout raiz): o
 *   `<use>` herda traço, preenchimento e cor deste `<svg>`, e nenhum ícone entra no JS (B-018).
 */
export function Icon({
  name,
  size = 24,
  strokeWidth = 1.5,
  color = "currentColor",
  fill = "none",
  className,
  style,
}: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cx("block shrink-0", className)}
      style={style}
    >
      <use href={`#icon-${name}`} />
    </svg>
  );
}
