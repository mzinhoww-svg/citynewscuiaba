/** Circular icon button — back, more, notifications (with Urucum badge dot). */
export interface IconButtonProps {
  icon: import('../icons/Icon').IconName;
  variant?: 'outline' | 'filled' | 'inverse' | 'ghost';
  /** diameter in px; 48 default (mockup header buttons) */
  size?: number;
  /** Urucum "O Ponto" dot for unread notifications */
  badge?: boolean;
  label?: string;
  iconColor?: string;
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
