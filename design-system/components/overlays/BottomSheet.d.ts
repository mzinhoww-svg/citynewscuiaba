/** Bottom sheet with grabber and centered title (display settings, filters, share). */
export interface BottomSheetProps { open?: boolean; title?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode; onClose?: () => void; inline?: boolean; }
export declare function BottomSheet(props: BottomSheetProps): JSX.Element | null;
