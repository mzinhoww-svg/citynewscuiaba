/** Labeled input on a Papel fill, 52px tall, radius 16, leading icon; password type adds an eye toggle. */
export interface TextFieldProps {
  label?: string;
  icon?: import('../icons/Icon').IconName;
  type?: 'text' | 'email' | 'password' | 'tel';
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}
export declare function TextField(props: TextFieldProps): JSX.Element;
