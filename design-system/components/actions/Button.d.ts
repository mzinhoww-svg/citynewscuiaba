/**
 * Pill button. Primary = Tinta fill; outline = social/secondary; text = Urucum Texto link.
 * @startingPoint section="Actions" subtitle="Pill buttons in all variants" viewport="700x300"
 */
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'outline-strong' | 'accent' | 'text' | 'danger';
  /** lg 56 (full-width CTAs) · md 44 · sm 30 (Follow) */
  size?: 'lg' | 'md' | 'sm';
  icon?: import('../icons/Icon').IconName;
  iconRight?: import('../icons/Icon').IconName;
  /** Custom leading node, e.g. a provider logo <img> */
  leading?: React.ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
