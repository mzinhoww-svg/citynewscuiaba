/** Centered confirm dialog over a blurred Tinta scrim. Title + stacked actions (primary button, danger text). */
export interface DialogProps { open?: boolean; title?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; onClose?: () => void; /** render the box without the scrim (docs) */ inline?: boolean; }
export declare function Dialog(props: DialogProps): JSX.Element | null;
