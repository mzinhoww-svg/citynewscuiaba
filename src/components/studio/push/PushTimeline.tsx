import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { PUSH_HISTORY_TEXT as T } from "@/content/pt-BR/notifications-admin";
import type { HistoryDetail } from "@/lib/db/queries/push-admin";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface PushTimelineProps {
  items: HistoryDetail["timeline"];
  className?: string;
}

/** Linha do tempo do envio (spec §10.4): pedido, aprovação, início, fim e desfecho, em texto. */
export function PushTimeline({ items, className }: PushTimelineProps) {
  return (
    <ol className={cx("flex flex-col gap-2", className)} aria-label={T.detail.timeline}>
      {items.map((it, i) => (
        <li key={`${it.label}-${i}`} className="flex items-start gap-3 type-body text-strong">
          <Icon name="check" size={18} className="mt-0.5 shrink-0 text-meta" />
          <span>
            <span className="font-semibold">{T.detail.labels[it.label]}</span>
            {it.by && <span> · {it.by}</span>}
            <span className="block type-meta text-meta">{fullDateTime(it.at)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
