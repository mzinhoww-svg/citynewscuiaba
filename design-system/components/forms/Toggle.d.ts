/** 40×24 switch; ON = Cerrado. Settings rows (Face ID, lembrar senha, notificações). */
export interface ToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}
export declare function Toggle(props: ToggleProps): JSX.Element;
