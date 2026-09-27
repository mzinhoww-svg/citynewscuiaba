/**
 * Website masthead from the brand kit: horizontal signature, centered sections, "● AGORA" live indicator.
 * @startingPoint section="Web" subtitle="Site masthead" viewport="1200x120"
 */
export interface SiteHeaderProps { items?: string[]; active?: string; onNavigate?: (item: string) => void; logoBase?: string; live?: boolean; style?: React.CSSProperties; }
export declare function SiteHeader(props: SiteHeaderProps): JSX.Element;
