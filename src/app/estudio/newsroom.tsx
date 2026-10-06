import { Icon, TagLink, type StatGridItem } from "@/components";
import { QUEUE_TEXT as T } from "@/content/pt-BR/studio";
import { QUEUE_TABS, type NewsroomKpis } from "@/lib/db/queries/queue";
import { tabHref } from "./fila/rows";

const CALENDAR = "/estudio/calendario";

/**
 * Números do dia na Redação (E01, item 59): cada um leva à lista que explica o número. Sem
 * acesso à redação (`article.edit`), nenhum vira link (a fila e o calendário exigem o papel).
 */
export function newsroomStats(k: NewsroomKpis, desk: boolean): StatGridItem[] {
  const link = (href: string) => (desk ? href : undefined);
  return [
    { label: T.kpi.publishedToday, value: k.publishedToday, href: link(CALENDAR) },
    { label: T.kpi.auto24h, value: k.auto24h, href: link(tabHref("auto24h")) },
    { label: T.kpi.exceptions, value: k.exceptions, href: link(tabHref("exceptions")) },
    {
      label: T.kpi.overdue,
      // Atenção com ícone e peso, nunca só cor.
      value:
        k.overdue > 0 ? (
          <span className="inline-flex items-center gap-2 text-warn">
            <Icon name="triangle-alert" size={20} />
            {k.overdue}
          </span>
        ) : (
          k.overdue
        ),
      href: link("/estudio/fila?prazo=vencido"),
    },
    { label: T.kpi.scheduled, value: k.scheduled, href: link(CALENDAR) },
  ];
}

/** Atalhos para as abas da Fila (item 59): links para outra tela, não abas desta. */
export function QueueShortcuts() {
  return (
    <nav aria-label={T.seeInQueue} className="flex flex-col gap-2">
      <p className="type-meta font-semibold text-strong">{T.seeInQueue}</p>
      <ul className="flex flex-wrap gap-2">
        {QUEUE_TABS.map((k) => (
          <li key={k}>
            <TagLink href={tabHref(k)}>{T.tabs[k]}</TagLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
