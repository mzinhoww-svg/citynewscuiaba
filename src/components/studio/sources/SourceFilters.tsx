import Link from "next/link";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin-list";
import { LOCALITY_LABEL, RELIABILITY_LABEL } from "@/content/pt-BR/sources-admin";
import type { SourceFilters as Filters } from "@/lib/db/queries/sources-admin";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { Select, type SelectOption } from "../../ui/Select";
import { TextField } from "../../ui/TextField";
import { activeFilterCount, clearedHref, LIST_PATH } from "./list-url";

export interface SourceFiltersProps {
  filters: Filters;
  className?: string;
}

const entries = (labels: Record<string, string>): SelectOption[] =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/**
 * Filtros da lista de fontes num formulário GET: o estado fica na URL e funciona sem JavaScript.
 * Busca, estado, camada, via de coleta, saúde, confiabilidade, localidade e arquivadas; a ordem
 * atual acompanha o envio.
 */
export function SourceFilters({ filters, className }: SourceFiltersProps) {
  const f = T.filters;
  const any: SelectOption = { value: "", label: f.any };
  const anyM: SelectOption = { value: "", label: f.anyM };
  const count = activeFilterCount(filters);
  return (
    <form
      method="get"
      action={LIST_PATH}
      aria-label={f.label}
      className={cx(
        "grid grid-cols-1 gap-3 rounded-lg border border-line-subtle bg-card-white p-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {filters.sort !== "name" && <input type="hidden" name="ordem" value={filters.sort} />}
      {filters.dir !== "asc" && <input type="hidden" name="dir" value={filters.dir} />}
      <TextField
        id="filtro-q"
        name="q"
        label={f.search}
        icon="search"
        placeholder={f.searchPlaceholder}
        defaultValue={filters.q}
        maxLength={80}
        className="sm:col-span-2 lg:col-span-4"
      />
      <Select
        id="filtro-status"
        name="status"
        label={f.status}
        options={[any, ...entries(T.statusOption)]}
        defaultValue={filters.status.length === 1 ? filters.status[0] : ""}
      />
      <Select
        id="filtro-camada"
        name="camada"
        label={f.layer}
        options={[any, ...entries(T.layerOption)]}
        defaultValue={filters.layer.length === 1 ? String(filters.layer[0]) : ""}
      />
      <Select
        id="filtro-via"
        name="via"
        label={f.via}
        options={[any, ...entries(f.via_)]}
        defaultValue={filters.via ?? ""}
      />
      <Select
        id="filtro-saude"
        name="saude"
        label={f.health}
        options={[anyM, ...entries(T.healthOption)]}
        defaultValue={filters.health ?? ""}
      />
      <Select
        id="filtro-confiabilidade"
        name="confiabilidade"
        label={f.reliability}
        options={[any, ...entries(RELIABILITY_LABEL)]}
        defaultValue={filters.reliability ?? ""}
      />
      <Select
        id="filtro-localidade"
        name="localidade"
        label={f.locality}
        options={[any, ...entries(LOCALITY_LABEL)]}
        defaultValue={filters.locality ?? ""}
      />
      <Select
        id="filtro-arquivadas"
        name="arquivadas"
        label={f.archived}
        options={entries({
          no: f.archivedOptions.no,
          only: f.archivedOptions.only,
          all: f.archivedOptions.all,
        })}
        defaultValue={filters.archived}
      />
      <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-1">
        <Button type="submit" size="md">
          {f.apply}
        </Button>
        {count > 0 && (
          <>
            <Link
              href={clearedHref(filters)}
              className="inline-flex min-h-tap items-center text-16 font-semibold text-link underline underline-offset-4"
            >
              {f.clear}
            </Link>
            <span className="type-meta text-meta">{f.active(count)}</span>
          </>
        )}
      </div>
    </form>
  );
}
