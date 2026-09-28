import Link from "next/link";
import { fullDateTime, SOURCES_LIST_TEXT as T, scoreText } from "@/content/pt-BR/sources-admin";
import type { SourceListRow } from "@/lib/db/queries/sources-admin";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import { FrequencyLabel } from "./FrequencyLabel";
import { HealthBadge } from "./HealthBadge";
import { SourceStatusBadge } from "./SourceStatusBadge";

export interface SourceRowMobileProps {
  row: SourceListRow;
  href: string;
  selected: boolean;
  onToggle: () => void;
  onCollectNow: () => void;
  onPauseResume: () => void;
  busy?: boolean;
  className?: string;
}

/**
 * Linha da lista de fontes em 360 px (spec §8, O03): nome, status, score, saúde e próxima
 * coleta em um cartão; as demais colunas ficam no menu de ações. Sem rolagem horizontal.
 */
export function SourceRowMobile({
  row,
  href,
  selected,
  onToggle,
  onCollectNow,
  onPauseResume,
  busy = false,
  className,
}: SourceRowMobileProps) {
  const canCollectNow = row.displayStatus === "active" || row.displayStatus === "degraded";
  const canPause = row.displayStatus === "active" || row.displayStatus === "degraded";
  const canResume = row.displayStatus === "paused";
  return (
    <li
      className={cx(
        "flex flex-col gap-3 border-b border-line-subtle bg-card-white p-4 last:border-b-0",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          aria-label={T.columns.selectOne(row.name)}
          checked={selected}
          onChange={onToggle}
          className="mt-1 size-5 shrink-0 accent-action-primary"
        />
        <div className="min-w-0 flex-1">
          <Link href={href} className="type-section text-strong no-underline hover:underline">
            {row.name}
          </Link>
          <p className="type-meta text-meta">{row.domain}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <SourceStatusBadge status={row.displayStatus} reason={row.statusReason} />
        <span className="type-meta text-strong">{scoreText(row.editorialScore)}</span>
        <HealthBadge score={row.operationalScore} label={row.health} />
      </div>
      <FrequencyLabel
        frequencyMinutes={row.frequencyMinutes}
        effective={row.effective}
        nextCollectionAt={row.nextCollectionAt}
      />
      <div className="flex flex-wrap items-center gap-2">
        {canCollectNow && (
          <button
            type="button"
            onClick={onCollectNow}
            disabled={busy}
            aria-label={`${T.rowActions.collectNow} · ${row.name}`}
            className="hit-area inline-flex items-center gap-1.5 rounded-pill border border-line-control px-3 type-meta text-strong disabled:opacity-60"
          >
            <Icon name="refresh-cw" size={16} />
            <span aria-hidden="true">{T.rowActions.collectNow}</span>
          </button>
        )}
        {(canPause || canResume) && (
          <button
            type="button"
            onClick={onPauseResume}
            disabled={busy}
            aria-label={`${canResume ? T.rowActions.resume : T.rowActions.pause} · ${row.name}`}
            className="hit-area inline-flex items-center gap-1.5 rounded-pill border border-line-control px-3 type-meta text-strong disabled:opacity-60"
          >
            <Icon name="circle-pause" size={16} />
            <span aria-hidden="true">{canResume ? T.rowActions.resume : T.rowActions.pause}</span>
          </button>
        )}
        <Link
          href={href}
          className="hit-area inline-flex items-center gap-1.5 rounded-pill border border-line-control px-3 type-meta text-strong no-underline"
        >
          {T.rowActions.open}
        </Link>
      </div>
      <p className="type-meta text-meta">
        {row.lastFetchedAt ? fullDateTime(row.lastFetchedAt) : T.never}
      </p>
    </li>
  );
}
