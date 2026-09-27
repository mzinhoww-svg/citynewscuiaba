"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TOPIC } from "@/content/pt-BR/portal";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { SegmentedToggle } from "../ui/SegmentedToggle";

export interface TopicCoverageProps {
  /** Veículos com itens agregados no assunto. */
  sources: { slug: string; name: string }[];
  /** Blocos marcados com `data-group="citynews"` e `data-group="external"`; itens agregados com `data-source`. */
  children: ReactNode;
  className?: string;
}

type Origin = "all" | "citynews" | "external";

/**
 * Filtros de origem e veículo da página de assunto (P05). A página continua estática (ISR):
 * o filtro só mostra ou esconde blocos já renderizados, e sem JavaScript tudo aparece.
 *
 * ```tsx
 * <TopicCoverage sources={fontes}><section data-group="citynews">…</section>…</TopicCoverage>
 * ```
 */
export function TopicCoverage({ sources, children, className }: TopicCoverageProps) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<Origin>("all");
  const [source, setSource] = useState("");

  useEffect(() => {
    const root = box.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-group]").forEach((el) => {
      el.hidden = origin !== "all" && el.dataset.group !== origin;
    });
    root.querySelectorAll<HTMLElement>("[data-source]").forEach((el) => {
      el.hidden = source !== "" && el.dataset.source !== source;
    });
  }, [origin, source]);

  return (
    <div ref={box} className={cx("flex flex-col gap-8", className)}>
      <div className="flex flex-wrap items-end gap-4">
        <SegmentedToggle
          label={TOPIC.filterLabel}
          value={origin}
          options={(["all", "citynews", "external"] as const).map((v) => ({
            value: v,
            label: TOPIC.filterOrigin[v],
          }))}
          onChange={(v) => setOrigin(v === "citynews" || v === "external" ? v : "all")}
        />
        {sources.length > 1 && origin !== "citynews" && (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-fonte`} className="type-meta text-strong">
              {TOPIC.filterSource}
            </label>
            <div className="relative">
              <select
                id={`${id}-fonte`}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="border-control h-tap cursor-pointer appearance-none rounded-pill bg-input pr-10 pl-4 text-14 text-strong"
              >
                <option value="">{TOPIC.allSources}</option>
                {sources.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Icon
                name="chevron-down"
                size={16}
                className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-meta"
              />
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
