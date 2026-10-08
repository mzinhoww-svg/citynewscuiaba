import { useId } from "react";
import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { EVENT_PREVIEW_TEXT as T } from "@/content/pt-BR/sources-admin-events";
import {
  EVIDENCE_FIELD_TEXT,
  EVIDENCE_YEAR_TEXT,
  REJECT_REASON_TEXT,
  RUN_STATUS_TEXT,
} from "@/content/pt-BR/studio-agenda";
import type { EvidenceRecord } from "@/lib/agenda/extract/evidence";
import type { EventSourcePreviewData } from "@/lib/agenda/preview";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface EventSourcePreviewProps {
  preview: EventSourcePreviewData;
  /** Nível do título da prévia. */
  headingLevel?: "h2" | "h3";
  className?: string;
}

const FIELDS = Object.keys(EVIDENCE_FIELD_TEXT) as (keyof typeof EVIDENCE_FIELD_TEXT)[];

const isWebUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

function Evidence({ evidence }: { evidence: EvidenceRecord }) {
  const fields = FIELDS.filter((f) => evidence[f]);
  if (fields.length === 0) return <p className="type-meta text-meta">{T.noEvidence}</p>;
  return (
    <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[max-content_1fr]">
      {fields.map((f) => {
        const e = evidence[f]!;
        return (
          <div key={f} className="contents">
            <dt className="type-meta text-meta">{EVIDENCE_FIELD_TEXT[f]}</dt>
            <dd className="min-w-0 type-body break-words text-strong">
              <span>{T.quote(e.trecho)}</span>
              {f === "data" && (
                <span className="type-meta text-meta"> · {EVIDENCE_YEAR_TEXT[e.ano]}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Prévia do teste de conexão de uma fonte de eventos (AGM-T6, spec §5.1): até 5 eventos com o
 * trecho da página que sustenta cada campo e as recusas com o motivo em texto. Situação da fonte
 * em texto quando não for "ok". Sem imagem de terceiro; links externos com `noopener`.
 *
 * ```tsx
 * <EventSourcePreview preview={result.data} headingLevel="h3" />
 * ```
 */
export function EventSourcePreview({
  preview,
  headingLevel = "h2",
  className,
}: EventSourcePreviewProps) {
  const Heading = headingLevel;
  const Sub = headingLevel === "h2" ? "h3" : "h4";
  const Item = headingLevel === "h2" ? "h4" : "h5";
  const id = useId();
  return (
    <section aria-labelledby={`${id}-t`} className={cx("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1">
        <Heading id={`${id}-t`} className="type-section text-strong">
          {T.title}
        </Heading>
        <p className="type-meta text-meta">{T.intro}</p>
        <p className="type-body font-semibold text-strong">
          {T.summary(preview.found, preview.approved, preview.aiPages)}
        </p>
        {preview.status !== "ok" && (
          <p className="flex items-start gap-1.5 type-body text-danger">
            <Icon name="circle-alert" size={18} className="mt-0.5 shrink-0" />
            <span>
              {T.status}: {RUN_STATUS_TEXT[preview.status]}
              {preview.detail ? ` · ${preview.detail}` : ""}
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Sub id={`${id}-e`} className="type-body font-semibold text-strong">
          {T.eventsTitle}
        </Sub>
        {preview.events.length === 0 ? (
          <p className="type-body text-meta">{T.empty}</p>
        ) : (
          <ol aria-labelledby={`${id}-e`} className="flex flex-col">
            {preview.events.map((e, i) => (
              <li
                key={`${e.sourceUrl}-${i}`}
                aria-labelledby={`${id}-e${i}`}
                className="flex flex-col gap-2 border-t border-line-section py-3"
              >
                <Item id={`${id}-e${i}`} className="type-body font-semibold text-strong">
                  {e.title}
                </Item>
                <p className="type-meta text-meta">
                  {T.when}: {fullDateTime(e.startsAt)} · {T.where}: {e.venue}
                </p>
                <p className="type-meta font-semibold text-meta">{T.evidence}</p>
                <Evidence evidence={e.evidence} />
                {isWebUrl(e.sourceUrl) && (
                  <a
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-fit type-meta text-link underline-offset-4 hover:underline"
                  >
                    {T.open}
                    <Icon name="external-link" size={14} className="ml-1 inline align-baseline" />
                    <span className="sr-only"> {e.title}</span>
                  </a>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Sub id={`${id}-r`} className="type-body font-semibold text-strong">
          {T.rejectedTitle}
        </Sub>
        {preview.rejected.length === 0 ? (
          <p className="type-body text-meta">{T.rejectedEmpty}</p>
        ) : (
          <ul aria-labelledby={`${id}-r`} className="flex flex-col">
            {preview.rejected.map((r, i) => (
              <li
                key={`${r.url}-${r.reason}-${i}`}
                className="flex flex-col gap-0.5 border-t border-line-section py-2.5"
              >
                <span className="type-body font-semibold text-strong">
                  {REJECT_REASON_TEXT[r.reason]}
                </span>
                <span className="min-w-0 type-meta break-all text-meta">{r.url}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
