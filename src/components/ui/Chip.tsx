"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cx } from "../cx";

export interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  /** Com `href`, o chip é um link (editorias); sem ele, um botão alternável. */
  href?: string;
  children?: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}

const chipClass = (active: boolean, onDark: boolean) =>
  cx(
    "hit-area inline-flex h-chip shrink-0 cursor-pointer items-center whitespace-nowrap rounded-pill px-4.5 text-14 leading-none no-underline",
    "transition-colors duration-(--dur-base) ease-(--ease-standard)",
    active
      ? onDark
        ? "bg-branco font-semibold text-tinta"
        : "bg-action-primary font-semibold text-on-inverse"
      : onDark
        ? "border border-branco/40 bg-transparent text-branco"
        : "bg-section text-meta hover:bg-nevoa-2 hover:text-strong",
  );

/**
 * Pílula de filtro por editoria sob a busca; use `ChipGroup` para a fileira com rolagem.
 *
 * ```tsx
 * <ChipGroup label="Editorias" items={["Tudo", "Cidade", "Política", "Esporte", "Cultura"]} value={cat} onChange={setCat} />
 * ```
 * - `tone="dark"` em cabeçalhos Tinta (ativo = pílula branca).
 * - Superfície Névoa (R1); ativo = Tinta com texto branco. Alvo de toque de 44 px.
 */
export function Chip({
  active = false,
  onClick,
  href,
  children,
  tone = "light",
  className,
}: ChipProps) {
  const classes = cx(chipClass(active, tone === "dark"), className);
  if (href) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={classes}>
      {children}
    </button>
  );
}

export interface ChipGroupProps {
  /** Nome do grupo (ex.: "Editorias"). */
  label: string;
  items: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  tone?: "light" | "dark";
  className?: string;
}

/** Fileira de `Chip` com rolagem horizontal e seleção única. */
export function ChipGroup({
  label,
  items,
  value,
  defaultValue,
  onChange,
  tone = "light",
  className,
}: ChipGroupProps) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  return (
    <div
      role="group"
      aria-label={label}
      className={cx("flex snap-x gap-2 overflow-x-auto py-1 scrollbar-none", className)}
    >
      {items.map((it) => (
        <Chip
          key={it}
          tone={tone}
          active={it === current}
          onClick={() => {
            if (value === undefined) setInner(it);
            onChange?.(it);
          }}
          className="snap-start"
        >
          {it}
        </Chip>
      ))}
    </div>
  );
}
