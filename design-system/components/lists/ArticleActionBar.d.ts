/** Sticky article footer: reading-progress line (Urucum) + like, comment, share, save. */
export interface ArticleActionBarProps { likes?: string | number; comments?: string | number; liked?: boolean; saved?: boolean; /** 0–1 */ progress?: number; onLike?: () => void; onComment?: () => void; onShare?: () => void; onSave?: () => void; style?: React.CSSProperties; }
export declare function ArticleActionBar(props: ArticleActionBarProps): JSX.Element;
