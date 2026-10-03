"use client";

import { useState, type ReactNode } from "react";
import { cx } from "../cx";
import { Tabs } from "../ui/Tabs";

export interface SectionTabsProps {
  /** Nome da lista de abas. */
  label: string;
  panels: { slug: string; name: string; content: ReactNode }[];
  className?: string;
}

/**
 * Editorias da home: abas no celular (um painel por vez), colunas no desktop, uma por painel até três
 * (sem coluna vazia; todos os painéis visíveis, sem abas). O conteúdo é o mesmo nos dois, só muda a exibição.
 *
 * ```tsx
 * <SectionTabs label="Editorias" panels={[{ slug: "politica", name: "Política", content }]} />
 * ```
 */
export function SectionTabs({ label, panels, className }: SectionTabsProps) {
  const [current, setCurrent] = useState(panels[0]?.name ?? "");
  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <Tabs
        label={label}
        items={panels.map((p) => p.name)}
        value={current}
        onChange={setCurrent}
        idPrefix="home-editorias"
        layout="scroll"
        className="lg:hidden"
      />
      <div
        className={cx(
          "grid grid-cols-1 gap-10",
          panels.length === 1 && "lg:grid-cols-1",
          panels.length === 2 && "lg:grid-cols-2",
          panels.length >= 3 && "lg:grid-cols-3",
        )}
      >
        {panels.map((p, i) => (
          <div
            key={p.slug}
            role="tabpanel"
            id={`home-editorias-painel-${i}`}
            aria-labelledby={`home-editorias-aba-${i}`}
            className={cx(p.name !== current && "hidden lg:block")}
          >
            {p.content}
          </div>
        ))}
      </div>
    </div>
  );
}
