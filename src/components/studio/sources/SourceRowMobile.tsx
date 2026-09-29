import Link from "next/link";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin-list";
import type { SourceListRow } from "@/lib/db/queries/sources-admin";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import { EditorialScore } from "./EditorialScore";
import { FrequencyLabel } from "./FrequencyLabel";
import { HealthBadge } from "./HealthBadge";
import { RowActions, type RowReply } from "./RowActions";
import { SourceStatusBadge } from "./SourceStatusBadge";

export interface SourceRowMobileProps {
  row: SourceListRow;
  selected: boolean;
  onToggle: (id: string) => void;
  onResult: (reply: RowReply) => void;
}

/**
 * A linha da tabela como item de lista (abaixo de 1024 px). O nome é o link para a fonte; a
 * seleção para o lote e as ações ficam no próprio item.
 */
export function SourceRowMobile({ row, selected, onToggle, onResult }: SourceRowMobileProps) {
  const inputId = `sel-${row.id}-m`;
  const href = `/estudio/control/fontes/${row.id}`;
  return (
    <li
      data-source={row.slug}
      className={cx(
        "flex flex-col gap-3 rounded-lg border bg-card-white p-4",
        selected ? "border-line-strong" : "border-line-subtle",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(row.id)}
          aria-label={T.selectRow(row.name)}
          className="mt-1 size-5 shrink-0 accent-(--action-primary)"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={href}
            className="type-headline-sm break-words text-strong underline-offset-4 hover:underline"
          >
            {row.name}
          </Link>
          <span className="break-all type-meta text-meta">{row.baseUrl}</span>
        </div>
      </div>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="type-meta text-meta">{T.columns.status}</dt>
          <dd>
            <SourceStatusBadge
              status={row.status}
              reason={row.statusReason}
              archived={row.archived}
            />
            {row.pendingApproval && (
              <span className="mt-1 flex items-center gap-1 type-meta text-warn">
                <Icon name="triangle-alert" size={16} />
                {T.approvalPending}
              </span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="type-meta text-meta">{T.columns.score}</dt>
          <dd>
            <EditorialScore score={row.editorialScore} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="type-meta text-meta">{T.columns.health}</dt>
          <dd className="flex flex-col gap-0.5">
            <HealthBadge state={row.health} score={row.operationalScore} />
            {row.errors24h > 0 && (
              <span className="type-meta text-danger">{T.errors24h(row.errors24h)}</span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="type-meta text-meta">{T.columns.frequency}</dt>
          <dd>
            <FrequencyLabel
              chosen={row.frequency.chosen}
              effective={row.frequency.effective}
              raisedBy={row.frequency.raisedBy}
              nextAt={row.nextCollectionAt}
              showNext={row.nextCollectionAt !== null}
            />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:col-span-2">
          <dt className="type-meta text-meta">{T.columns.last}</dt>
          <dd className="type-meta text-strong">
            {row.lastFetchedAt ? formatDateTime(row.lastFetchedAt) : T.neverCollected}
          </dd>
        </div>
      </dl>
      <RowActions row={row} onResult={onResult} />
    </li>
  );
}
