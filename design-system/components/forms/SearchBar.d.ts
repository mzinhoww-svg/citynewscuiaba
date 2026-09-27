/** Search field with trailing filter icon — top of Home, Search, Favorites. */
export interface SearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFilter?: () => void;
  showFilter?: boolean;
  style?: React.CSSProperties;
}
export declare function SearchBar(props: SearchBarProps): JSX.Element;
