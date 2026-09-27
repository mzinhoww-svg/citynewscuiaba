/** Compact pill switch between 2–3 values (light/dark reading theme). */
export interface SegmentedToggleOption { value: string; label: string; icon?: import('../icons/Icon').IconName; }
export interface SegmentedToggleProps {
  options: SegmentedToggleOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
}
export declare function SegmentedToggle(props: SegmentedToggleProps): JSX.Element;
