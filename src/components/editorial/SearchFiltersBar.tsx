import { SECTIONS } from "@/content/pt-BR/nav";
import { SEARCH } from "@/content/pt-BR/search";
import {
  SEARCH_DEFAULTS,
  SEARCH_PARAM_VALUES,
  searchHref,
  serializeSearch,
  type SearchFilters,
  type SearchOrigin,
  type SearchPeriod,
  type SearchType,
} from "@/lib/search/query";
import { cx } from "../cx";
import { Chip } from "../ui/Chip";
import { FilterBar } from "./FilterBar";

export interface SearchFiltersBarProps {
  filters: SearchFilters;
  className?: string;
}

/**
 * Abas por tipo (chips) e filtros da busca (P12). Os filtros aplicam ao mudar, sem botão; tudo
 * fica na URL (abas em links, filtros em formulário GET), o Voltar do navegador os restaura e a
 * troca de tipo não depende de JavaScript.
 *
 * ```tsx
 * <SearchFiltersBar filters={filters} />
 * ```
 */
export function SearchFiltersBar({ filters, className }: SearchFiltersBarProps) {
  const types = Object.keys(SEARCH.types) as SearchType[];
  const origins = Object.keys(SEARCH.origins) as SearchOrigin[];
  const periods = Object.keys(SEARCH.periods) as SearchPeriod[];
  const active =
    Number(filters.origin !== SEARCH_DEFAULTS.origin) +
    Number(filters.period !== SEARCH_DEFAULTS.period) +
    Number(!!filters.section) +
    Number(!!filters.source);
  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <nav aria-label={SEARCH.tabs}>
        <ul className="-mx-gutter flex snap-x scroll-px-gutter gap-2 overflow-x-auto px-gutter py-1 scrollbar-none lg:mx-0 lg:scroll-px-0 lg:px-0">
          {types.map((t) => (
            <li key={t} className="snap-start">
              <Chip href={searchHref(filters, { type: t })} active={filters.type === t}>
                {SEARCH.types[t]}
              </Chip>
            </li>
          ))}
        </ul>
      </nav>
      <FilterBar
        action="/busca"
        label={SEARCH.filters}
        formKey={serializeSearch(filters)}
        hidden={{
          q: filters.q,
          tipo:
            filters.type !== SEARCH_DEFAULTS.type
              ? SEARCH_PARAM_VALUES.type[filters.type]
              : undefined,
          fonte: filters.source,
        }}
        activeCount={active}
        clearHref={searchHref({ ...SEARCH_DEFAULTS, q: filters.q, type: filters.type })}
        clearLabel={SEARCH.clear}
        applyLabel={SEARCH.apply}
        fields={[
          {
            name: "origem",
            label: SEARCH.origin,
            value: SEARCH_PARAM_VALUES.origin[filters.origin],
            options: origins.map((o) => ({
              value: SEARCH_PARAM_VALUES.origin[o],
              label: SEARCH.origins[o],
            })),
          },
          {
            name: "editoria",
            label: SEARCH.section,
            value: filters.section ?? "",
            placeholder: SEARCH.allSections,
            options: SECTIONS.map((s) => ({ value: s.id, label: s.label })),
          },
          {
            name: "periodo",
            label: SEARCH.period,
            value: SEARCH_PARAM_VALUES.period[filters.period],
            options: periods.map((p) => ({
              value: SEARCH_PARAM_VALUES.period[p],
              label: SEARCH.periods[p],
            })),
          },
        ]}
      />
    </div>
  );
}
