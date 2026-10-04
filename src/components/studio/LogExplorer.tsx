import { CONTROL_TEXT, LEVEL_LABEL, stepLabel } from "@/content/pt-BR/control";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { CollapsibleFilters } from "../ui/CollapsibleFilters";
import { EmptyState } from "../ui/EmptyState";
import { Icon, type IconName } from "../ui/Icon";
import { Select, type SelectOption } from "../ui/Select";
import { TextField } from "../ui/TextField";

const T = CONTROL_TEXT.logs;

export interface LogExplorerFilters {
  run?: string;
  item?: string;
  source?: string;
  step?: string;
  level?: string;
  agent?: string;
  q?: string;
}

export interface LogExplorerRow {
  id: number;
  at: string;
  runId: string | null;
  step: string;
  itemRef: string | null;
  level: string;
  message: string;
  /** Detalhes já serializados (e mascarados, quando for o caso). */
  details: string;
}

export interface LogExplorerProps {
  action: string;
  filters: LogExplorerFilters;
  options: {
    sources: SelectOption[];
    steps: SelectOption[];
    levels: SelectOption[];
    agents: SelectOption[];
  };
  rows: LogExplorerRow[];
  /** Link da próxima página (eventos mais antigos), se houver. */
  moreHref: string | null;
  exportHref: string | null;
  masked: boolean;
}

const LEVEL_ICON: Record<string, IconName> = {
  info: "check",
  warn: "refresh-cw",
  error: "circle-alert",
  security: "shield",
};

/**
 * Explorador de logs (O08): filtros por ciclo, item, fonte, etapa, nível e agente e busca no
 * texto, num formulário GET (filtros na URL, funciona sem JavaScript); tabela do mais novo para
 * o mais antigo, com detalhes em `<details>`, paginação por "carregar mais" e exportação CSV.
 */
export function LogExplorer({
  action,
  filters,
  options,
  rows,
  moreHref,
  exportHref,
  masked,
}: LogExplorerProps) {
  const any = { value: "", label: T.any };
  return (
    <div className="flex flex-col gap-6">
      <CollapsibleFilters
        activeCount={Object.values(filters).filter(Boolean).length}
        clearHref={action}
        clearLabel={T.clear}
        className="rounded-lg border border-line-subtle bg-card-white px-4 py-2"
        bodyClassName="pb-2"
      >
        <form action={action} method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <h2 className="sr-only">{T.filters}</h2>
          <TextField id="log-q" name="q" label={T.q} defaultValue={filters.q ?? ""} />
          <Select
            id="log-source"
            name="fonte"
            label={T.source}
            options={[any, ...options.sources]}
            defaultValue={filters.source ?? ""}
          />
          <Select
            id="log-step"
            name="etapa"
            label={T.step}
            options={[any, ...options.steps]}
            defaultValue={filters.step ?? ""}
          />
          <Select
            id="log-level"
            name="nivel"
            label={T.level}
            options={[any, ...options.levels]}
            defaultValue={filters.level ?? ""}
          />
          <Select
            id="log-agent"
            name="agente"
            label={T.agent}
            options={[any, ...options.agents]}
            defaultValue={filters.agent ?? ""}
          />
          <TextField id="log-run" name="ciclo" label={T.run} defaultValue={filters.run ?? ""} />
          <TextField id="log-item" name="item" label={T.item} defaultValue={filters.item ?? ""} />
          <div className="flex flex-wrap items-end gap-3">
            <Button type="submit" size="md" icon="search">
              {T.apply}
            </Button>
          </div>
        </form>
      </CollapsibleFilters>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-meta text-meta" aria-live="polite">
          {T.count(rows.length)}
          {masked && <> · {T.masked}</>}
        </p>
        {exportHref && rows.length > 0 && (
          <Button href={exportHref} size="sm" variant="outline" icon="download">
            {T.export}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={T.empty}
          icon="search"
          actions={
            <Button href={action} size="md" variant="outline">
              {T.emptyAction}
            </Button>
          }
        />
      ) : (
        <div
          role="region"
          aria-label={T.caption}
          tabIndex={0}
          className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
        >
          <table className="w-full min-w-[56rem] border-collapse text-left">
            <caption className="sr-only">{T.caption}</caption>
            <thead className="border-b border-line-subtle bg-section type-meta text-meta">
              <tr>
                <th scope="col" className="px-3 py-3">
                  {T.col.at}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.col.level}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.col.step}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.col.item}
                </th>
                <th scope="col" className="px-3 py-3">
                  {T.col.message}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line-subtle align-top last:border-b-0">
                  <th
                    scope="row"
                    className="px-3 py-2 type-meta font-normal tabular-nums text-body"
                  >
                    <time dateTime={r.at}>{formatDateTime(r.at)}</time>
                  </th>
                  <td className="px-3 py-2 type-meta">
                    <span
                      className={cx(
                        "inline-flex items-center gap-1 font-semibold",
                        r.level === "info"
                          ? "text-service"
                          : r.level === "warn"
                            ? "text-warn"
                            : "text-danger",
                      )}
                    >
                      <Icon name={LEVEL_ICON[r.level] ?? "info"} size={14} />
                      {LEVEL_LABEL[r.level] ?? r.level}
                    </span>
                  </td>
                  <td className="px-3 py-2 type-meta text-strong">{stepLabel(r.step)}</td>
                  <td className="px-3 py-2 type-meta break-all text-body">{r.itemRef ?? ""}</td>
                  <td className="px-3 py-2 type-meta text-body">
                    {r.message}
                    {r.details !== "{}" && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-link">{T.details}</summary>
                        <pre className="mt-1 max-w-xl overflow-x-auto whitespace-pre-wrap break-all rounded-sm bg-section p-2 text-12">
                          {r.details}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {moreHref && (
        <div>
          <Button href={moreHref} size="md" variant="outline">
            {T.more}
          </Button>
        </div>
      )}
    </div>
  );
}
