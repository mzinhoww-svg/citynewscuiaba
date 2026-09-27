/** Section title (Grotesk 20 bold) with optional "Ver tudo" link in Urucum Texto. */
export interface SectionHeaderProps { title: React.ReactNode; action?: string | null; onAction?: () => void; eyebrow?: string; style?: React.CSSProperties; }
export declare function SectionHeader(props: SectionHeaderProps): JSX.Element;
