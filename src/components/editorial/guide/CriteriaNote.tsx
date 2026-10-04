import { dataLine, GUIDE } from "@/content/pt-BR/guide";
import type { DataSource } from "@/lib/guide/types";
import { formatDate } from "@/lib/format/date";

export interface CriteriaNoteProps {
  criteria: string;
  dataSources: readonly DataSource[];
  refreshedAt: string;
  sponsorName?: string | null;
}

/**
 * "Como escolhemos": o critério em texto simples, de onde vêm os dados ("Dados: ...") e a data da
 * última atualização. Sem rótulo de revisão nem de automação. Patrocínio aparece como texto e
 * lembra que não altera a ordem.
 */
export function CriteriaNote({
  criteria,
  dataSources,
  refreshedAt,
  sponsorName,
}: CriteriaNoteProps) {
  const data = dataLine(dataSources);
  return (
    <section
      aria-labelledby="como-escolhemos"
      className="flex flex-col gap-3 border-t-2 border-cerrado bg-section px-5 py-4"
    >
      <h2 id="como-escolhemos" className="type-section text-strong">
        {GUIDE.list.criteriaTitle}
      </h2>
      <p className="max-w-read type-body-read text-body">{criteria}</p>
      {sponsorName && (
        <p className="type-meta text-strong">
          {GUIDE.list.sponsoredBy(sponsorName)}. {GUIDE.list.sponsoredNote}
        </p>
      )}
      <p className="type-meta text-meta">
        {data && <span>{data}. </span>}
        {refreshedAt && (
          <time dateTime={refreshedAt}>{GUIDE.list.updated(formatDate(refreshedAt))}</time>
        )}
      </p>
    </section>
  );
}
