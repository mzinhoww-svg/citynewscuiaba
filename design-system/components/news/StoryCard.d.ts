/** Vertical card: photo (category pill + save toggle) over a serif headline and byline. Saved list, "Favoritas da semana". */
export interface StoryCardProps { title: string; image?: string; category?: string; author?: string; avatar?: string | null; time?: string; comments?: number; saved?: boolean; onToggleSave?: () => void; onClick?: () => void; width?: number | string; style?: React.CSSProperties; }
export declare function StoryCard(props: StoryCardProps): JSX.Element;
