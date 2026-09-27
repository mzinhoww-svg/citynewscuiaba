/** Equal-width segmented tabs (Matérias / Temas / Autores on Search). */
export interface TabsProps { items: string[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; style?: React.CSSProperties; }
export declare function Tabs(props: TabsProps): JSX.Element;
