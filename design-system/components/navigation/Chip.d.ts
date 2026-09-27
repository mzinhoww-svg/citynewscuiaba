/** Category filter pill — Papel fill, active = Tinta fill + white text. */
export interface ChipProps { active?: boolean; onClick?: () => void; children?: React.ReactNode; tone?: 'light' | 'dark'; }
export declare function Chip(props: ChipProps): JSX.Element;
/** Horizontally scrolling row of Chips (editorias). */
export interface ChipGroupProps { items: string[]; value?: string; onChange?: (v: string) => void; tone?: 'light' | 'dark'; style?: React.CSSProperties; }
export declare function ChipGroup(props: ChipGroupProps): JSX.Element;
