import { LOCALITY_TEXT } from "@/content/pt-BR/recommendations";
import {
  HEALTH_TEXT,
  LAYER_TEXT,
  SOURCE_STATUS_TEXT,
  SOURCES_LIST_TEXT as T,
  type DisplayStatus,
} from "@/content/pt-BR/sources-admin";
import type { HealthLabel } from "@/lib/sources";
import type { SourceFilters as Filters } from "@/lib/db/queries/sources-admin";
import { Button } from "../../ui/Button";
import { CollapsibleFilters } from "../../ui/CollapsibleFilters";
import { Select } from "../../ui/Select";
import { TextField } from "../../ui/TextField";

export interface SourceFiltersProps {
  filters: Filters;
  basePath: string;
  className?: string;
}

const STATUSES: readonly DisplayStatus[] = [
  "active",
  "degraded",
  "paused",
  "auto_paused",
  "blocked",
  "archived",
];
const HEALTHS: readonly HealthLabel[] = ["saudavel", "atencao", "critica", "sem_dados"];
const LOCALITIES = ["cuiaba", "varzea-grande", "mt", "nacional"] as const;

/**
 * Busca e filtros da lista de fontes (spec §8, O03): formulário `GET` sem JavaScript, valores na
 * URL (A-037 ignora inválidos na leitura). Preserva ordenação e reseta a página ao filtrar.
 * Recolhível (`CollapsibleFilters`): fechado no celular, aberto no desktop.
 */
export function SourceFilters({ filters, basePath, className }: SourceFiltersProps) {
  const activeCount = [
    filters.q,
    filters.status,
    filters.layer,
    filters.locality,
    filters.health,
    filters.via,
    filters.pending,
  ].filter(Boolean).length;
  return (
    <CollapsibleFilters
      activeCount={activeCount}
      clearHref={basePath}
      clearLabel={T.filters.clear}
      className={className ?? "rounded-lg border border-line-section bg-card-white px-4 py-2"}
      bodyClassName="pb-2"
    >
      <form method="get" action={basePath} className="flex flex-col gap-4">
        <input type="hidden" name="ordem" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            id="fontes-busca"
            name="q"
            label={T.search.label}
            icon="search"
            placeholder={T.search.placeholder}
            defaultValue={filters.q ?? ""}
          />
          <Select
            id="fontes-status"
            name="status"
            label={T.filters.status}
            placeholder={T.filters.statusAll}
            defaultValue={filters.status ?? ""}
            options={STATUSES.map((s) => ({ value: s, label: SOURCE_STATUS_TEXT[s] }))}
          />
          <Select
            id="fontes-camada"
            name="camada"
            label={T.filters.layer}
            placeholder={T.filters.layerAll}
            defaultValue={filters.layer ? String(filters.layer) : ""}
            options={([1, 2, 3, 4] as const).map((l) => ({
              value: String(l),
              label: LAYER_TEXT[l],
            }))}
          />
          <Select
            id="fontes-localidade"
            name="localidade"
            label={T.filters.locality}
            placeholder={T.filters.localityAll}
            defaultValue={filters.locality ?? ""}
            options={LOCALITIES.map((l) => ({ value: l, label: LOCALITY_TEXT[l] ?? l }))}
          />
          <Select
            id="fontes-saude"
            name="saude"
            label={T.filters.health}
            placeholder={T.filters.healthAll}
            defaultValue={filters.health ?? ""}
            options={HEALTHS.map((h) => ({ value: h, label: HEALTH_TEXT[h] }))}
          />
          <Select
            id="fontes-via"
            name="via"
            label={T.filters.via}
            placeholder={T.filters.viaAll}
            defaultValue={filters.via ?? ""}
            options={[
              { value: "rapida", label: T.filters.viaFast },
              { value: "normal", label: T.filters.viaNormal },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex min-h-tap items-center gap-2 type-body text-strong">
            <input
              type="checkbox"
              name="pendente"
              value="1"
              defaultChecked={filters.pending}
              className="size-5 accent-action-primary"
            />
            {T.filters.pending}
          </label>
          <Button type="submit" size="sm" variant="secondary">
            {T.filters.submit}
          </Button>
        </div>
      </form>
    </CollapsibleFilters>
  );
}
