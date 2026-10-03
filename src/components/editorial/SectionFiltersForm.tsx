import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import { SECTION_PAGE } from "@/content/pt-BR/portal-section";
import {
  SECTION_DEFAULTS,
  SECTION_PARAM_VALUES,
  serializeSectionFilters,
  type SectionFilters,
  type SectionOrder,
  type SectionOrigin,
  type SectionPeriod,
} from "@/lib/filters/section";
import { FilterBar } from "./FilterBar";

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
 * Filtros da editoria (período, bairro, origem, ordem) numa barra única: aplicam ao mudar e
 * ficam na URL (formulário GET), então o Voltar do navegador os restaura (P02, spec §4.6).
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
  return (
    <FilterBar
      action={action}
      label={SECTION_PAGE.filters}
      formKey={serializeSectionFilters({ ...filters, page: 1 })}
      hidden={{ sub: filters.sub }}
      activeCount={active}
      clearHref={clearHref}
      clearLabel={SECTION_PAGE.clear}
      applyLabel={SECTION_PAGE.apply}
      className={className}
      fields={[
        {
          name: "periodo",
          label: SECTION_PAGE.period,
          value: SECTION_PARAM_VALUES.period[filters.period],
          options: options<SectionPeriod>(SECTION_PARAM_VALUES.period, SECTION_PAGE.periods),
        },
        {
          name: "bairro",
          label: SECTION_PAGE.neighborhood,
          value: filters.neighborhood ?? "",
          placeholder: SECTION_PAGE.allNeighborhoods,
          options: NEIGHBORHOODS.map((n) => ({ value: n.slug, label: n.name })),
        },
        {
          name: "origem",
          label: SECTION_PAGE.origin,
          value: SECTION_PARAM_VALUES.origin[filters.origin],
          options: options<SectionOrigin>(SECTION_PARAM_VALUES.origin, SECTION_PAGE.origins),
        },
        {
          name: "ordem",
          label: SECTION_PAGE.order,
          value: SECTION_PARAM_VALUES.order[filters.order],
          options: options<SectionOrder>(SECTION_PARAM_VALUES.order, SECTION_PAGE.orders),
        },
      ]}
    />
  );
}
