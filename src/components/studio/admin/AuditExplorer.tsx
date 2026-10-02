import Link from "next/link";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import type { AuditFilters, AuditRow } from "@/lib/admin/audit-export";
import { formatDateTime } from "@/lib/format/date";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { TextField } from "../../ui/TextField";
import { AdminTable } from "./AdminStatus";

export interface AuditExplorerProps {
  action: string;
  filters: AuditFilters;
  rows: AuditRow[];
  moreHref: string | null;
  exportHref: string;
  masked: boolean;
}

const A = T.audit;

/**
 * Auditoria (A10): filtros num formulário GET (funciona sem JavaScript), tabela do mais novo
 * para o mais antigo com detalhes em `<details>`, "carregar mais antigos" e exportação CSV.
 * Registro só de acréscimo: nenhuma ação de edição aqui.
 */
export function AuditExplorer({
  action,
  filters,
  rows,
  moreHref,
  exportHref,
  masked,
}: AuditExplorerProps) {
  return (
    <div className="flex flex-col gap-6">
      <form
        action={action}
        method="get"
        className="grid gap-4 rounded-lg border border-line-subtle bg-card-white p-4 md:grid-cols-2 xl:grid-cols-5"
      >
        <h2 className="sr-only">{A.filters}</h2>
        <TextField id="aud-ator" name="ator" label={A.actor} defaultValue={filters.actor ?? ""} />
        <TextField id="aud-acao" name="acao" label={A.action} defaultValue={filters.action ?? ""} />
        <TextField
          id="aud-objeto"
          name="objeto"
          label={A.object}
          defaultValue={filters.object ?? ""}
        />
        <TextField
          id="aud-de"
          name="de"
          label={A.from}
          defaultValue={filters.from ?? ""}
          placeholder="AAAA-MM-DD"
        />
        <TextField
          id="aud-ate"
          name="ate"
          label={A.to}
          defaultValue={filters.to ?? ""}
          placeholder="AAAA-MM-DD"
        />
        <div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-5">
          <Button type="submit" size="md" icon="search">
            {A.apply}
          </Button>
          <Link
            href={action}
            className="inline-flex min-h-tap items-center type-body font-medium text-link underline"
          >
            {A.clear}
          </Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-meta text-meta" aria-live="polite">
          {A.count(rows.length, moreHref !== null)}
          {masked && <> · {A.masked}</>}
        </p>
        {rows.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <Button href={exportHref} size="sm" variant="outline" icon="download">
              {A.export}
            </Button>
            <p className="type-meta text-meta">{A.exportNote}</p>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={A.empty} icon="search" />
      ) : (
        <AdminTable
          caption={A.table}
          headers={[A.col.when, A.col.who, A.col.action, A.col.object, A.col.details, A.col.ip]}
          minWidth="min-w-[56rem]"
        >
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line-subtle align-top last:border-0">
              <td className="px-3 py-2 type-meta text-meta tabular-nums whitespace-nowrap">
                {formatDateTime(r.at)}
              </td>
              <td className="px-3 py-2 type-body text-strong">
                {r.actorName ?? r.actor}
                {r.actorName && (
                  <span className="block type-meta text-meta">{r.actor.slice(0, 8)}</span>
                )}
              </td>
              <td className="px-3 py-2 type-body text-body">
                <code className="font-mono text-14">{r.action}</code>
              </td>
              <td className="px-3 py-2 type-body text-body break-all">{r.objectRef}</td>
              <td className="px-3 py-2 type-body text-body">
                <details>
                  <summary className="cursor-pointer type-meta font-medium text-link">
                    {A.details}
                  </summary>
                  <pre className="mt-1 max-w-xs overflow-x-auto whitespace-pre-wrap break-all font-mono text-12 text-body">
                    {JSON.stringify(r.details, null, 1)}
                  </pre>
                </details>
              </td>
              <td className="px-3 py-2 type-meta text-meta">
                {r.ipHash ? r.ipHash.slice(0, 10) : "—"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
      {moreHref && (
        <div>
          <Button href={moreHref} size="md" variant="outline">
            {A.more}
          </Button>
        </div>
      )}
    </div>
  );
}
