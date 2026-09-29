import {
  AGENT_LABEL,
  LEVEL_LABEL,
  MONITOR_TEXT as T,
  STEP_LABEL,
} from "@/content/pt-BR/control-monitor";
import type { EventRow } from "@/lib/control/types";
import { formatDateTime } from "@/lib/format/date";
import { STEP_NAMES, type StepName } from "@/lib/pipeline/types";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Select } from "../ui/Select";
import { TextField } from "../ui/TextField";
import { SortHeader } from "./SortHeader";

export interface LogFilterValues {
  ciclo?: string;
  item?: string;
  fonte?: string;
  etapa?: string;
  nivel?: string;
  agente?: string;
  q?: string;
}

export interface LogExplorerProps {
  action: string;
  values: LogFilterValues;
  rows: readonly EventRow[];
  page: number;
  hasMore: boolean;
  /** Ordem por data: `desc` (padrão, mais recentes primeiro) ou `asc`. */
  order: "asc" | "desc";
  /** Endereços já vêm mascarados (`true` quando o papel não é admin): só avisa a pessoa. */
  masked: boolean;
  /** Link de cada página e da ordenação, com os filtros atuais. */
  hrefFor: (over: { page?: number; order?: "asc" | "desc" }) => string;
  exportHref: string;
  className?: string;
}

const LEVEL_ICON = {
  info: "info",
  warn: "triangle-alert",
  error: "circle-alert",
  security: "shield",
} as const;

/**
 * Explorador de logs (O08): filtros por ciclo, item, fonte, etapa, nível e agente, busca no
 * texto, paginação, ordenação por data e exportação. Formulário GET (funciona sem JavaScript).
 * Nível sempre em texto e ícone.
 */
export function LogExplorer({
  action,
  values,
  rows,
  page,
  hasMore,
  order,
  masked,
  hrefFor,
  exportHref,
  className,
}: LogExplorerProps) {
  const any = { value: "", label: T.logs.any };
  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <form
        method="get"
        action={action}
        aria-label={T.logs.filters}
        className="grid grid-cols-1 gap-3 rounded-lg border border-line-subtle bg-card-white p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <TextField
          id="log-ciclo"
          name="ciclo"
          label={T.logs.run}
          defaultValue={values.ciclo ?? ""}
        />
        <TextField id="log-item" name="item" label={T.logs.item} defaultValue={values.item ?? ""} />
        <TextField
          id="log-fonte"
          name="fonte"
          label={T.logs.source}
          defaultValue={values.fonte ?? ""}
        />
        <Select
          id="log-etapa"
          name="etapa"
          label={T.logs.step}
          defaultValue={values.etapa ?? ""}
          options={[any, ...STEP_NAMES.map((s) => ({ value: s, label: STEP_LABEL[s] }))]}
        />
        <Select
          id="log-nivel"
          name="nivel"
          label={T.logs.level}
          defaultValue={values.nivel ?? ""}
          options={[
            any,
            ...(Object.keys(LEVEL_LABEL) as (keyof typeof LEVEL_LABEL)[]).map((l) => ({
              value: l,
              label: LEVEL_LABEL[l],
            })),
          ]}
        />
        <Select
          id="log-agente"
          name="agente"
          label={T.logs.agent}
          defaultValue={values.agente ?? ""}
          options={[
            any,
            ...Object.entries(AGENT_LABEL).map(([value, label]) => ({ value, label })),
          ]}
        />
        <div className="sm:col-span-2 lg:col-span-3">
          <TextField
            id="log-q"
            name="q"
            label={T.logs.query}
            defaultValue={values.q ?? ""}
            icon="search"
          />
        </div>
        <input type="hidden" name="ordem" value={order === "asc" ? "asc" : ""} />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
          <Button type="submit" size="md">
            {T.logs.apply}
          </Button>
          <Button href={action} size="md" variant="text">
            {T.logs.clear}
          </Button>
          <Button href={exportHref} size="md" variant="outline" icon="copy">
            {T.logs.export}
          </Button>
          <span className="type-meta text-meta">{T.logs.exportNote}</span>
        </div>
      </form>
      {masked && <p className="type-meta text-meta">{T.logs.maskedNote}</p>}
      {rows.length === 0 ? (
        <EmptyState title={T.logs.empty} icon="search" as="h2">
          {T.logs.emptyBody}
        </EmptyState>
      ) : (
        <div
          role="region"
          aria-label={T.logs.caption}
          tabIndex={0}
          className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
        >
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <caption className="sr-only">{T.logs.caption}</caption>
            <thead className="border-b border-line-subtle bg-section">
              <tr>
                <SortHeader
                  label={T.logs.colWhen}
                  active
                  dir={order === "asc" ? "asc" : "desc"}
                  href={hrefFor({ order: order === "asc" ? "desc" : "asc", page: 1 })}
                />
                <th scope="col" className="px-3 py-1 type-meta text-meta">
                  {T.logs.colLevel}
                </th>
                <th scope="col" className="px-3 py-1 type-meta text-meta">
                  {T.logs.colStep}
                </th>
                <th scope="col" className="px-3 py-1 type-meta text-meta">
                  {T.logs.colItem}
                </th>
                <th scope="col" className="px-3 py-1 type-meta text-meta">
                  {T.logs.colMessage}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.id}
                  data-level={e.level}
                  className="border-b border-line-subtle align-top last:border-b-0"
                >
                  <td className="px-3 py-3 type-body tabular-nums">{formatDateTime(e.at)}</td>
                  <td className="px-3 py-3 type-body">
                    <span
                      className={cx(
                        "inline-flex items-center gap-1",
                        (e.level === "error" || e.level === "security") &&
                          "font-semibold text-danger",
                        e.level === "warn" && "text-warn",
                      )}
                    >
                      <Icon name={LEVEL_ICON[e.level]} size={16} />
                      {LEVEL_LABEL[e.level]}
                    </span>
                  </td>
                  <td className="px-3 py-3 type-body">
                    {STEP_LABEL[e.step as StepName] ?? e.step}
                  </td>
                  <td className="break-all px-3 py-3 type-body">{e.itemRef ?? "—"}</td>
                  <td className="px-3 py-3 type-body">
                    {e.message}
                    {hasDetails(e.details) && (
                      <details className="mt-1">
                        <summary className="cursor-pointer type-meta text-link">
                          {T.logs.details}
                        </summary>
                        <pre className="mt-1 max-w-[36rem] overflow-x-auto whitespace-pre-wrap break-words type-meta text-meta">
                          {JSON.stringify(e.details, null, 2)}
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
      <nav aria-label={T.logs.page(page)} className="flex flex-wrap items-center gap-3">
        {page > 1 && (
          <Button href={hrefFor({ page: page - 1 })} size="md" variant="outline">
            {T.logs.newer}
          </Button>
        )}
        <span className="type-meta text-meta">{T.logs.page(page)}</span>
        {hasMore && (
          <Button href={hrefFor({ page: page + 1 })} size="md" variant="outline">
            {T.logs.older}
          </Button>
        )}
      </nav>
    </div>
  );
}

function hasDetails(d: unknown): boolean {
  return typeof d === "object" && d !== null && Object.keys(d).length > 0;
}
