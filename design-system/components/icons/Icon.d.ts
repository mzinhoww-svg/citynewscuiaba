export type IconName = 'arrow-left'|'bell'|'book-open'|'bookmark'|'calendar'|'camera'|'chart-column'|'check'|'chevron-down'|'chevron-right'|'circle-help'|'clock'|'ellipsis'|'ellipsis-vertical'|'eye'|'eye-off'|'flame'|'globe'|'heart'|'house'|'lock'|'log-out'|'mail'|'map-pin'|'message-circle'|'moon'|'newspaper'|'percent'|'play'|'plus'|'repeat-2'|'search'|'settings'|'share-2'|'shield'|'sliders-horizontal'|'sun'|'trending-up'|'type'|'user'|'users'|'x';
/** Outline icon (Lucide geometry, 24 grid, 1.5 stroke). */
export interface IconProps { name: IconName; size?: number; strokeWidth?: number; color?: string; fill?: string; style?: React.CSSProperties; }
export declare function Icon(props: IconProps): JSX.Element | null;
export declare const ICON_NAMES: IconName[];
