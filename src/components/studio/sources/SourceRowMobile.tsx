import Link from "next/link";
import { fullDateTime, SOURCES_LIST_TEXT as T, scoreText } from "@/content/pt-BR/sources-admin";
import type { SourceListRow } from "@/lib/db/queries/sources-admin";
import { cx } from "../../cx";
import { FrequencyLabel } from "./FrequencyLabel";
import { HealthBadge } from "./HealthBadge";
import { SourceRowMenu } from "./SourceRowMenu";
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
        <SourceRowMenu
          name={row.name}
          href={href}
          canCollectNow={canCollectNow}
          canPause={canPause}
          canResume={canResume}
          busy={busy}
          onCollectNow={onCollectNow}
          onPauseResume={onPauseResume}
        />
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
      <p className="type-meta text-meta">
        {row.lastFetchedAt ? fullDateTime(row.lastFetchedAt) : T.never}
      </p>
    </li>
  );
}
