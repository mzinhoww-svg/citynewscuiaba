/** Horizontal slider with Urucum fill; optional discrete steps (font size) and end adornments (A / A, sun icons). */
export interface SliderProps {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  /** number of discrete stops, e.g. 7 for font size */
  steps?: number;
  onChange?: (v: number) => void;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
}
export declare function Slider(props: SliderProps): JSX.Element;
