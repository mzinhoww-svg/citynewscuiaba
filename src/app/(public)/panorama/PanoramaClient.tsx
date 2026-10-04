"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import { AggregatedCard, Checkbox, Chip, EmptyState, SegmentedToggle } from "@/components";
import { PANORAMA_TEXT as T } from "@/content/pt-BR/sources";
import { useAnonProfile } from "@/lib/anon/use-profile";
import type { AggregatedView } from "@/lib/db/queries/types";

export interface PanoramaClientProps {
  items: AggregatedView[];
  sources: { slug: string; name: string; popularity: number }[];
}

type Order = "recent" | "read";
type Mode = "all" | "followed" | "custom";

/** Escolha de fontes exibidas: só neste navegador (conveniência local, nunca enviada). */
const KEY = "cn:panorama:fontes";

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
/** Texto guardado ("" sem escolha); `null` no servidor e na hidratação. */
function snapshot(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function parseChoice(raw: string | null): { mode: Mode; slugs: string[] } | null {
  try {
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const o = v as { mode?: unknown; slugs?: unknown };
    const mode = o.mode === "followed" || o.mode === "custom" ? o.mode : "all";
    const slugs = Array.isArray(o.slugs)
      ? o.slugs.filter((s): s is string => typeof s === "string")
      : [];
    return { mode, slugs };
  } catch {
    return null;
  }
}

function writeChoice(c: { mode: Mode; slugs: string[] }) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // Armazenamento bloqueado: a escolha vale só nesta visita.
  }
  for (const l of listeners) l();
}

/**
 * "Mais recentes das suas fontes" do Panorama (P16): seletor de fontes exibidas (local) e ordem
 * (recentes ou mais lidas, pela popularidade da fonte). Cada item é um card AGREGADO que abre
 * o original. Sem JavaScript, mostra todos por ordem de publicação.
 */
export function PanoramaClient({ items, sources }: PanoramaClientProps) {
  const id = useId();
  const { profile } = useAnonProfile();
  const [order, setOrder] = useState<Order>("recent");
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const [session, setSession] = useState<{ mode: Mode; slugs: string[] } | null>(null);
  const choice = session ?? parseChoice(raw) ?? { mode: "all" as Mode, slugs: [] };
  const { mode } = choice;
  const custom = choice.slugs;
  const loaded = raw !== null;

  const followed = useMemo(
    () => (profile?.follows ?? []).filter((f) => f.kind === "source").map((f) => f.id),
    [profile],
  );
  const selected = useMemo(() => {
    if (mode === "followed") return new Set(followed);
    if (mode === "custom") return new Set(custom);
    return null;
  }, [mode, followed, custom]);

  const popularity = new Map(sources.map((s) => [s.slug, s.popularity]));
  const shown = items
    .filter((i) => !selected || selected.has(i.sourceSlug))
    .sort((a, b) =>
      order === "read"
        ? (popularity.get(b.sourceSlug) ?? 0) - (popularity.get(a.sourceSlug) ?? 0) ||
          Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "")
        : 0,
    );

  const change = (next: { mode: Mode; slugs: string[] }) => {
    setSession(next);
    writeChoice(next);
  };
  const toggle = (slug: string) => {
    const base = selected ? [...selected] : sources.map((s) => s.slug);
    const slugs = base.includes(slug) ? base.filter((s) => s !== slug) : [...base, slug];
    change({ mode: "custom", slugs });
  };

  return (
    <section
      aria-labelledby={`${id}-t`}
      data-ready={loaded ? "true" : undefined}
      className="flex flex-col gap-4"
    >
      <h2 id={`${id}-t`} className="type-section text-strong">
        {T.latestTitle}
      </h2>
      <div className="flex flex-wrap items-end gap-4">
        <SegmentedToggle
          label={T.order}
          value={order}
          options={[
            { value: "recent", label: T.orderRecent },
            { value: "read", label: T.orderRead },
          ]}
          onChange={(v) => setOrder(v === "read" ? "read" : "recent")}
        />
      </div>
      <details className="border border-line-section bg-card-white p-4">
        <summary className="inline-flex min-h-tap cursor-pointer items-center type-body font-semibold text-strong">
          {T.picker}
        </summary>
        <fieldset className="mt-2 flex flex-col gap-3">
          <legend className="type-meta text-meta">{T.pickerHint}</legend>
          <div className="flex flex-wrap gap-2">
            <Chip active={mode === "all"} onClick={() => change({ mode: "all", slugs: [] })}>
              {T.pickerAll}
            </Chip>
            {followed.length > 0 && (
              <Chip
                active={mode === "followed"}
                onClick={() => change({ mode: "followed", slugs: [] })}
              >
                {T.pickerFollowed}
              </Chip>
            )}
          </div>
          <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((s) => (
              <li key={s.slug}>
                <Checkbox
                  name="fontes"
                  value={s.slug}
                  label={s.name}
                  checked={!selected || selected.has(s.slug)}
                  onChange={() => toggle(s.slug)}
                />
              </li>
            ))}
          </ul>
        </fieldset>
      </details>
      {shown.length === 0 ? (
        <EmptyState title={T.latestEmpty}>
          <p>{T.latestEmptyText}</p>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((item) => (
            <li key={item.id} className="flex min-w-0" data-item-source={item.sourceSlug}>
              <AggregatedCard item={item} surface="white" className="min-w-0 flex-1" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
