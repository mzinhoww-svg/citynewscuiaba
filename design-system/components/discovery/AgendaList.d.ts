/** Agenda (events) list from the brand kit: time-stacked (sidebar "Agenda de hoje") or day-row (weekend guide). */
export interface AgendaItem { when: string; title: string; place?: string; }
export interface AgendaListProps { items: AgendaItem[]; variant?: 'time' | 'day'; title?: string; surface?: 'papel' | 'none'; style?: React.CSSProperties; }
export declare function AgendaList(props: AgendaListProps): JSX.Element;
