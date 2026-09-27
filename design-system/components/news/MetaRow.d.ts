/** Byline/metadata row: author (+avatar), trending, comment count, relative time, overflow. */
export interface MetaRowProps { author?: string; avatar?: string | null; time?: string; comments?: number | string; category?: string; trending?: string; onMore?: () => void; inverse?: boolean; style?: React.CSSProperties; }
export declare function MetaRow(props: MetaRowProps): JSX.Element;
