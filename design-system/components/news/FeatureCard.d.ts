/** Hero carousel card: full-bleed photo, protection gradient, category pill + meta on top, serif headline in white. */
export interface FeatureCardProps { title: string; image?: string; category?: string; time?: string; comments?: number; width?: number | string; height?: number | string; onClick?: () => void; style?: React.CSSProperties; }
export declare function FeatureCard(props: FeatureCardProps): JSX.Element;
