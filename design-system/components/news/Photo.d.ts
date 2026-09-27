/** Image frame with the brand "Foto" placeholder (warm grey box) when no src is supplied. */
export interface PhotoProps { src?: string; alt?: string; label?: string; ratio?: string | number; height?: number | string; radius?: string | number; style?: React.CSSProperties; children?: React.ReactNode; }
export declare function Photo(props: PhotoProps): JSX.Element;
