/** Bottom app navigation, 64px; active item in Urucum Texto with an Urucum top indicator. */
export interface TabBarItem { id: string; label: string; icon: import('../icons/Icon').IconName; fillActive?: boolean; }
export interface TabBarProps { items: TabBarItem[]; value: string; onChange?: (id: string) => void; style?: React.CSSProperties; }
export declare function TabBar(props: TabBarProps): JSX.Element;
