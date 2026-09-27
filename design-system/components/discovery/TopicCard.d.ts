/** Tema tile: icon in white circle, label, Seguir/Seguindo toggle — 3-up grid on Search › Temas. */
export interface TopicCardProps { label: string; icon?: import('../icons/Icon').IconName; following?: boolean; defaultFollowing?: boolean; onToggle?: (following: boolean) => void; style?: React.CSSProperties; }
export declare function TopicCard(props: TopicCardProps): JSX.Element;
