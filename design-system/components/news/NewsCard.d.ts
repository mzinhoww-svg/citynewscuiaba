/**
 * Horizontal list card: 96px thumb + serif headline (clamped) + meta row, on a Papel card (r20).
 * @startingPoint section="News" subtitle="List card for feeds" viewport="700x420"
 */
export interface NewsCardProps { title: string; image?: string; category?: string; author?: string; comments?: number; time?: string; onClick?: () => void; onMore?: () => void; surface?: 'papel' | 'white'; style?: React.CSSProperties; }
export declare function NewsCard(props: NewsCardProps): JSX.Element;
