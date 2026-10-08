"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TOPIC } from "@/content/pt-BR/portal-topic";
import { cx } from "../cx";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { SegmentedToggle } from "../ui/SegmentedToggle";
import { Select } from "../ui/Select";

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
      <CollapsibleFilters
        activeCount={(origin !== "all" ? 1 : 0) + (source !== "" ? 1 : 0)}
        bodyClassName="flex flex-wrap items-end gap-4"
      >
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
          <Select
            id={`${id}-fonte`}
            name="fonte"
            label={TOPIC.filterSource}
            size="sm"
            placeholder={TOPIC.allSources}
            options={sources.map((s) => ({ value: s.slug, label: s.name }))}
            value={source}
            onChange={setSource}
          />
        )}
      </CollapsibleFilters>
      {children}
    </div>
  );
}
