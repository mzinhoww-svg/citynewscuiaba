import { QUEUE_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { Select, type SelectOption } from "../ui/Select";

export interface QueueFiltersProps {
  action: string;
  tab: string;
  values: Partial<
    Record<"estado" | "editoria" | "origem" | "confianca" | "responsavel" | "prazo", string>
  >;
  options: {
    status: readonly SelectOption[];
    section: readonly SelectOption[];
    origin: readonly SelectOption[];
    confidence: readonly SelectOption[];
    assignee: readonly SelectOption[];
    due: readonly SelectOption[];
  };
  className?: string;
}

/**
 * Filtros da fila (E02) num formulário GET: o estado fica na URL e funciona sem JavaScript.
 * Estado, editoria, origem, confiança, responsável e prazo. Recolhível (`CollapsibleFilters`):
 * fechado no celular, aberto no desktop; "Limpar" só aparece com filtro ativo.
 */
export function QueueFilters({ action, tab, values, options, className }: QueueFiltersProps) {
  const any: SelectOption = { value: "", label: T.filter.any };
  const field = (
    name: keyof QueueFiltersProps["values"],
    label: string,
    opts: readonly SelectOption[],
  ) => (
    <Select
      id={`filtro-${name}`}
      name={name}
      label={label}
      options={[any, ...opts]}
      defaultValue={values[name] ?? ""}
    />
  );
  const activeCount = Object.values(values).filter(Boolean).length;
  return (
    <CollapsibleFilters
      activeCount={activeCount}
      clearHref={`${action}?aba=${tab}`}
      clearLabel={T.filterClear}
      className={cx("rounded-lg border border-line-subtle bg-card-white px-4 py-2", className)}
      bodyClassName="pb-2"
    >
      <form
        method="get"
        action={action}
        aria-label={T.filters}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        <input type="hidden" name="aba" value={tab} />
        {field("estado", T.filter.status, options.status)}
        {field("editoria", T.filter.section, options.section)}
        {field("origem", T.filter.origin, options.origin)}
        {field("confianca", T.filter.confidence, options.confidence)}
        {field("responsavel", T.filter.assignee, options.assignee)}
        {field("prazo", T.filter.due, options.due)}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3 xl:col-span-6">
          <Button type="submit" size="md">
            {T.filterApply}
          </Button>
        </div>
      </form>
    </CollapsibleFilters>
  );
}
