/** Settings / picker row: optional icon or leading node, label, value, trailing chevron | check | custom (Toggle). */
export interface ListRowProps { icon?: import('../icons/Icon').IconName; leading?: React.ReactNode; label: React.ReactNode; value?: string; trailing?: 'chevron' | 'check' | null | React.ReactNode; selected?: boolean; danger?: boolean; bordered?: boolean; onClick?: () => void; style?: React.CSSProperties; }
export declare function ListRow(props: ListRowProps): JSX.Element;
