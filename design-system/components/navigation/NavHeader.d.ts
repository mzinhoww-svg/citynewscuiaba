/** Screen header: back button left, centered title, optional right action. */
export interface NavHeaderProps {
  title?: React.ReactNode;
  onBack?: () => void;
  right?: React.ReactNode;
  /** circle = 48px bordered back button (feed/article); plain = bare arrow (settings stack) */
  variant?: 'circle' | 'plain';
  divider?: boolean;
  style?: React.CSSProperties;
}
export declare function NavHeader(props: NavHeaderProps): JSX.Element;
