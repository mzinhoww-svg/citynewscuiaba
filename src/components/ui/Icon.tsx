import type { CSSProperties } from "react";
import { cx } from "../cx";
import type { IconName } from "./icon-names";

export type { IconName };

/**
 * Escala de ícones (item 42, D-19), fechada:
 * - 14: selos e plaquetas compactas;
 * - 16: metadados, avisos de campo e links pequenos;
 * - 18: texto de corpo e itens de menu;
 * - 20: botões, linhas de lista e controles de formulário;
 * - 24: navegação, cabeçalhos e campos (padrão).
 * Nada fora dela: um 22 vira 20 (botão) ou 24 (navegação).
 */
export type IconSize = 14 | 16 | 18 | 20 | 24;

export interface IconProps {
  name: IconName;
  /** Ver `IconSize`: 16 em metadados, 20 em botões e linhas de lista, 24 em navegação e campos. */
  size?: IconSize;
  strokeWidth?: number;
  /**
   * Cor do traço; o padrão `currentColor` herda a cor do texto. Prefira `className="text-…"`
   * (token de texto) a passar `var(--…)` aqui.
   */
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
 * <Icon name="search" size={24} className="text-placeholder" />
 * <Icon name="bookmark" fill="currentColor" />
 * ```
 * - `size` na escala `IconSize` (14/16/18/20/24): 16 em metadado, 20 em botões, 24 em navegação.
 * - Cor por classe de texto (`text-meta`, `text-link`): o traço usa `currentColor`.
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
