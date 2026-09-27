/** Simple vertical bar chart (hourly readership), Cerrado gradient bars, optional Urucum highlight. */
export interface BarChartProps { values: number[]; labels?: string[]; height?: number; highlight?: number; style?: React.CSSProperties; }
export declare function BarChart(props: BarChartProps): JSX.Element;
