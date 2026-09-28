import { QUEUE_TEXT as T } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Button } from "../ui/Button";
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
 * Estado, editoria, origem, confiança, responsável e prazo.
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
  return (
    <form
      method="get"
      action={action}
      aria-label={T.filters}
      className={cx(
        "grid grid-cols-1 gap-3 rounded-lg border border-line-subtle bg-card-white p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
        className,
      )}
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
        <Button href={`${action}?aba=${tab}`} size="md" variant="text">
          {T.filterClear}
        </Button>
      </div>
    </form>
  );
}
