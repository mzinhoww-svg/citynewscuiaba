import Form from "next/form";
import Link from "next/link";
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
import { Button } from "../ui/Button";
import { Select } from "../ui/Select";

export interface SearchFiltersBarProps {
  filters: SearchFilters;
  className?: string;
}

const chip = (active: boolean) =>
  cx(
    "hit-area inline-flex h-chip shrink-0 cursor-pointer items-center whitespace-nowrap rounded-pill px-4.5 text-14 leading-none no-underline",
    active
      ? "bg-action-primary font-semibold text-on-inverse"
      : "bg-section text-meta hover:bg-nevoa-2 hover:text-strong",
  );

/** Campos ocultos que preservam os filtros que o formulário não mostra. */
function Keep({ values }: { values: Record<string, string | undefined> }) {
  return (
    <>
      {Object.entries(values).map(([name, v]) =>
        v ? <input key={name} type="hidden" name={name} value={v} /> : null,
      )}
    </>
  );
}

/**
 * Abas por tipo, origem e filtros da busca (P12). Tudo em links e formulários GET: os filtros
 * ficam na URL, o Voltar do navegador os restaura e nada depende de JavaScript.
 *
 * ```tsx
 * <SearchFiltersBar filters={filters} />
 * ```
 * - Origem em botões com `aria-pressed` (o estado não depende só da cor).
 */
export function SearchFiltersBar({ filters, className }: SearchFiltersBarProps) {
  const types = Object.keys(SEARCH.types) as SearchType[];
  const origins = Object.keys(SEARCH.origins) as SearchOrigin[];
  const periods = Object.keys(SEARCH.periods) as SearchPeriod[];
  const filtered =
    filters.origin !== SEARCH_DEFAULTS.origin ||
    filters.period !== SEARCH_DEFAULTS.period ||
    !!filters.section ||
    !!filters.source;
  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <nav aria-label={SEARCH.tabs}>
        <ul className="flex snap-x gap-1 overflow-x-auto border-b border-line-section scrollbar-none">
          {types.map((t) => {
            const active = filters.type === t;
            return (
              <li key={t} className="snap-start">
                <Link
                  href={searchHref(filters, { type: t })}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "-mb-px inline-flex min-h-tap items-center border-b-2 px-3 text-14 whitespace-nowrap no-underline",
                    active
                      ? "border-line-strong font-semibold text-strong"
                      : "border-transparent text-meta hover:text-strong",
                  )}
                >
                  {SEARCH.types[t]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form
          action="/busca"
          role="group"
          aria-label={SEARCH.origin}
          className="flex flex-wrap gap-2"
        >
          <Keep
            values={{
              q: filters.q,
              tipo:
                filters.type !== SEARCH_DEFAULTS.type
                  ? SEARCH_PARAM_VALUES.type[filters.type]
                  : undefined,
              editoria: filters.section,
              periodo:
                filters.period !== SEARCH_DEFAULTS.period
                  ? SEARCH_PARAM_VALUES.period[filters.period]
                  : undefined,
              fonte: filters.source,
            }}
          />
          {origins.map((o) => (
            <button
              key={o}
              type="submit"
              name="origem"
              value={SEARCH_PARAM_VALUES.origin[o]}
              aria-pressed={filters.origin === o}
              className={chip(filters.origin === o)}
            >
              {SEARCH.origins[o]}
            </button>
          ))}
        </form>

        <Form
          key={serializeSearch(filters)}
          action="/busca"
          autoComplete="off"
          aria-label={SEARCH.filters}
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <Keep
            values={{
              q: filters.q,
              tipo:
                filters.type !== SEARCH_DEFAULTS.type
                  ? SEARCH_PARAM_VALUES.type[filters.type]
                  : undefined,
              origem:
                filters.origin !== SEARCH_DEFAULTS.origin
                  ? SEARCH_PARAM_VALUES.origin[filters.origin]
                  : undefined,
              fonte: filters.source,
            }}
          />
          <Select
            id="busca-editoria"
            name="editoria"
            label={SEARCH.section}
            placeholder={SEARCH.allSections}
            defaultValue={filters.section ?? ""}
            options={SECTIONS.map((s) => ({ value: s.id, label: s.label }))}
          />
          <Select
            id="busca-periodo"
            name="periodo"
            label={SEARCH.period}
            defaultValue={SEARCH_PARAM_VALUES.period[filters.period]}
            options={periods.map((p) => ({
              value: SEARCH_PARAM_VALUES.period[p],
              label: SEARCH.periods[p],
            }))}
          />
          <Button type="submit" size="md" variant="outline">
            {SEARCH.apply}
          </Button>
        </Form>
      </div>

      {filtered && (
        <p>
          <Link
            href={searchHref({ ...SEARCH_DEFAULTS, q: filters.q, type: filters.type })}
            className="inline-flex min-h-tap items-center text-14 font-semibold text-link underline underline-offset-4 hover:text-strong"
          >
            {SEARCH.clear}
          </Link>
        </p>
      )}
    </div>
  );
}
