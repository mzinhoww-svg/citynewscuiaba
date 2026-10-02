import type { CSSProperties } from "react";
import { cx } from "../cx";
import {
  HORIZONTAL_CITY,
  HORIZONTAL_SYMBOL_TRANSFORM,
  HORIZONTAL_VIEWBOX,
  HORIZONTAL_WORDMARK,
  VERTICAL_CITY,
  VERTICAL_SYMBOL_TRANSFORM,
  VERTICAL_VIEWBOX,
  VERTICAL_WORDMARK,
} from "./logo-paths";

export type LogoCity = keyof typeof HORIZONTAL_CITY;

export interface LogoProps {
  variant?: "horizontal" | "vertical" | "symbol";
  /** default: Tinta + ponto Urucum · negative: branco + ponto Urucum (sobre Tinta ou foto) · mono: uma cor */
  tone?: "default" | "negative" | "mono";
  /** Linha geográfica. A versão vertical só existe com Cuiabá. */
  city?: LogoCity;
  size?: "sm" | "md" | "lg";
  /** Aplica a área de proteção (2× o diâmetro do ponto) como padding. */
  clearSpace?: boolean;
  /** Dentro de um link que já tem nome, marque como decorativo. */
  decorative?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Arco do C aberto e ponto Urucum ("O Ponto"), viewBox 10 10 90 80. */
const ARC = "M74.5 29.4 A32 32 0 1 0 74.5 70.6";

const HEIGHT = {
  horizontal: { sm: "h-8", md: "h-10", lg: "h-14" },
  vertical: { sm: "h-16", md: "h-24", lg: "h-32" },
  symbol: { sm: "h-6", md: "h-8", lg: "h-12" },
} as const;

/* 2× o diâmetro do ponto, em proporção da altura de cada arte. */
const CLEAR = {
  horizontal: { sm: "p-2.5", md: "p-3", lg: "p-4" },
  vertical: { sm: "p-3", md: "p-4", lg: "p-6" },
  symbol: { sm: "p-2.5", md: "p-3.5", lg: "p-5" },
} as const;

const TONE = {
  default: { ink: "text-strong", dot: "var(--accent)" },
  negative: { ink: "text-branco", dot: "var(--cn-urucum)" },
  mono: { ink: "", dot: "currentColor" },
} as const;

/**
 * A assinatura da marca: nunca redigite nem redesenhe; use sempre este componente, que
 * desenha os SVGs vetoriais de `design-system/assets/logo/svg/` (DESIGN.md R12).
 *
 * ```tsx
 * <Logo size="md" />                                  // horizontal, Cuiabá
 * <Logo tone="negative" />                            // sobre Tinta ou foto
 * <Logo variant="symbol" size="sm" />                 // ≥ 16 px; favicons, avatares
 * <Logo city="Várzea Grande" />                       // a linha geográfica muda
 * ```
 * - Mínimo de 96 px de largura no digital (a menor altura horizontal, `sm`, dá 128 px).
 * - Área de proteção = 2× o diâmetro do ponto (`clearSpace`, ligada por padrão).
 * - Nome acessível: "CityNews" (símbolo) ou "CityNews" + linha geográfica.
 */
export function Logo({
  variant = "horizontal",
  tone = "default",
  city = "Cuiabá",
  size = "md",
  clearSpace = true,
  decorative = false,
  className,
  style,
}: LogoProps) {
  const t = TONE[tone];
  const effectiveCity: LogoCity = variant === "vertical" ? "Cuiabá" : city;
  const name = variant === "symbol" ? "CityNews" : `CityNews ${effectiveCity}`;
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": name } as const);
  const classes = cx(
    "block w-auto shrink-0",
    HEIGHT[variant][size],
    clearSpace && CLEAR[variant][size],
    clearSpace && "box-content",
    t.ink,
    className,
  );

  const symbol = (
    <>
      <path d={ARC} fill="none" stroke="currentColor" strokeWidth={15} />
      <circle cx={90} cy={50} r={9} fill={t.dot} />
    </>
  );

  if (variant === "symbol") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="10 10 90 80"
        className={classes}
        style={style}
        focusable="false"
        {...a11y}
      >
        {symbol}
      </svg>
    );
  }

  const horizontal = variant === "horizontal";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={horizontal ? HORIZONTAL_VIEWBOX : VERTICAL_VIEWBOX}
      className={classes}
      style={style}
      focusable="false"
      {...a11y}
    >
      <g transform={horizontal ? HORIZONTAL_SYMBOL_TRANSFORM : VERTICAL_SYMBOL_TRANSFORM}>
        {symbol}
      </g>
      <path d={horizontal ? HORIZONTAL_WORDMARK : VERTICAL_WORDMARK} fill="currentColor" />
      <path d={horizontal ? HORIZONTAL_CITY[effectiveCity] : VERTICAL_CITY} fill="currentColor" />
    </svg>
  );
}
