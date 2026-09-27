/** Metric tile for author/newsroom stats: icon, label, value, colored delta. */
export interface StatCardProps { icon: import('../icons/Icon').IconName; label: string; value: string; delta?: string; trend?: 'up' | 'down'; style?: React.CSSProperties; }
export declare function StatCard(props: StatCardProps): JSX.Element;
