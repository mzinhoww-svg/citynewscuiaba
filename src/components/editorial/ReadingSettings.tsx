"use client";

import { useState } from "react";
import { ARTICLE } from "@/content/pt-BR/portal-article";
import { applyTheme, type Theme } from "@/lib/theme/apply";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { SegmentedToggle } from "../ui/SegmentedToggle";

type Size = "md" | "lg" | "xl";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return allowed.find((a) => a === v) ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Navegação privada sem armazenamento: vale só nesta página.
  }
}

/**
 * Ajustar leitura (P03): tamanho do texto da matéria e tema claro/escuro. A escolha fica neste
 * navegador (`cn_reading_size`, `cn_theme`) e é aplicada antes da pintura no layout raiz.
 *
 * ```tsx
 * <ReadingSettings />
 * ```
 */
export function ReadingSettings({
  className,
  buttonSize = "md",
}: {
  className?: string;
  buttonSize?: "md" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState<Size>("md");
  const [theme, setTheme] = useState<Theme>("light");

  const openSheet = () => {
    setSize(read<Size>("cn_reading_size", ["md", "lg", "xl"], "md"));
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "dark" : "light");
    setOpen(true);
  };

  return (
    <>
      <Button
        variant="outline"
        size={buttonSize}
        icon="type"
        collapseLabel
        onClick={openSheet}
        className={className}
      >
        {ARTICLE.adjust}
      </Button>
      <BottomSheet
        open={open}
        title={ARTICLE.adjustTitle}
        onClose={() => setOpen(false)}
        footer={
          <Button fullWidth onClick={() => setOpen(false)}>
            {ARTICLE.done}
          </Button>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="type-label text-16 text-strong">{ARTICLE.textSize}</p>
            <SegmentedToggle
              label={ARTICLE.textSize}
              value={size}
              options={(["md", "lg", "xl"] as const).map((v) => ({
                value: v,
                label: ARTICLE.sizes[v],
              }))}
              onChange={(v) => {
                const next: Size = v === "lg" || v === "xl" ? v : "md";
                setSize(next);
                save("cn_reading_size", next);
                if (next === "md") document.documentElement.removeAttribute("data-reading-size");
                else document.documentElement.setAttribute("data-reading-size", next);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="type-label text-16 text-strong">{ARTICLE.theme}</p>
            <SegmentedToggle
              label={ARTICLE.theme}
              value={theme}
              options={[
                { value: "light", label: ARTICLE.themes.light, icon: "sun" },
                { value: "dark", label: ARTICLE.themes.dark, icon: "moon" },
              ]}
              onChange={(v) => {
                const next: Theme = v === "dark" ? "dark" : "light";
                setTheme(next);
                save("cn_theme", next);
                applyTheme(next);
              }}
            />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
