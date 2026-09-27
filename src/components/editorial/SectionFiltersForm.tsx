import Form from "next/form";
import Link from "next/link";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import { SECTION_PAGE } from "@/content/pt-BR/portal";
import {
  SECTION_DEFAULTS,
  SECTION_PARAM_VALUES,
  serializeSectionFilters,
  type SectionFilters,
  type SectionOrder,
  type SectionOrigin,
  type SectionPeriod,
} from "@/lib/filters/section";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";

export interface SectionFiltersFormProps {
  /** Caminho da editoria (`/cidade`): o formulário é GET e grava os filtros na URL. */
  action: string;
  filters: SectionFilters;
  /** Link sem filtros (limpar). */
  clearHref: string;
  className?: string;
}

function options<T extends string>(values: Record<T, string>, labels: Record<T, string>) {
  return (Object.keys(values) as T[]).map((k) => ({ value: values[k], label: labels[k] }));
}

/** Quantos filtros diferem do padrão (subeditoria fica nos chips, não conta aqui). */
export function activeFilterCount(f: SectionFilters): number {
  return [
    f.period !== SECTION_DEFAULTS.period,
    !!f.neighborhood,
    f.origin !== SECTION_DEFAULTS.origin,
    f.order !== SECTION_DEFAULTS.order,
  ].filter(Boolean).length;
}

/**
 * Filtros da editoria (período, bairro, origem, ordem) em formulário GET: funcionam sem
 * JavaScript (com JS, navegação no cliente via `next/form`), ficam na URL e o botão Voltar do navegador os restaura (P02). Recolhidos quando
 * não há filtro ativo.
 *
 * ```tsx
 * <SectionFiltersForm action="/cidade" filters={filters} clearHref="/cidade" />
 * ```
 */
export function SectionFiltersForm({
  action,
  filters,
  clearHref,
  className,
}: SectionFiltersFormProps) {
  const active = activeFilterCount(filters);
  // A chave remonta os campos quando a URL muda (Voltar do navegador): o valor mostrado é
  // sempre o da URL, nunca o que o navegador guardou do formulário.
  return (
    <details
      key={serializeSectionFilters({ ...filters, page: 1 })}
      open={active > 0}
      className={cx("group", className)}
    >
      <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-2 rounded-pill border border-line-control bg-card-white px-5 text-14 font-semibold text-strong hover:bg-section [&::-webkit-details-marker]:hidden">
        <Icon name="sliders-horizontal" size={18} />
        {SECTION_PAGE.filters}
        {active > 0 && (
          <span className="type-meta text-meta">· {SECTION_PAGE.activeFilters(active)}</span>
        )}
        <Icon
          name="chevron-down"
          size={16}
          className="transition-transform duration-(--dur-fast) group-open:rotate-180"
        />
      </summary>
      <Form
        action={action}
        autoComplete="off"
        className="mt-4 grid grid-cols-1 gap-4 border-t border-line-subtle pt-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {filters.sub && <input type="hidden" name="sub" value={filters.sub} />}
        <Select
          id="filtro-periodo"
          name="periodo"
          label={SECTION_PAGE.period}
          defaultValue={SECTION_PARAM_VALUES.period[filters.period]}
          options={options<SectionPeriod>(SECTION_PARAM_VALUES.period, SECTION_PAGE.periods)}
        />
        <Select
          id="filtro-bairro"
          name="bairro"
          label={SECTION_PAGE.neighborhood}
          placeholder={SECTION_PAGE.allNeighborhoods}
          defaultValue={filters.neighborhood ?? ""}
          options={NEIGHBORHOODS.map((n) => ({ value: n.slug, label: n.name }))}
        />
        <Select
          id="filtro-origem"
          name="origem"
          label={SECTION_PAGE.origin}
          defaultValue={SECTION_PARAM_VALUES.origin[filters.origin]}
          options={options<SectionOrigin>(SECTION_PARAM_VALUES.origin, SECTION_PAGE.origins)}
        />
        <Select
          id="filtro-ordem"
          name="ordem"
          label={SECTION_PAGE.order}
          defaultValue={SECTION_PARAM_VALUES.order[filters.order]}
          options={options<SectionOrder>(SECTION_PARAM_VALUES.order, SECTION_PAGE.orders)}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" size="md">
            {SECTION_PAGE.apply}
          </Button>
          {active > 0 && (
            <Link
              href={clearHref}
              className="inline-flex min-h-tap items-center text-14 font-semibold text-link underline underline-offset-4 hover:text-strong"
            >
              {SECTION_PAGE.clear}
            </Link>
          )}
        </div>
      </Form>
    </details>
  );
}
