import { cx } from "../cx";

export interface FormStatusProps {
  /** Para o formulário apontar com `aria-describedby`. */
  id?: string;
  /** `error` anuncia com `role="alert"`; os demais, com `role="status"`. */
  tone: "success" | "error" | "info";
  /** Vazio deixa o contêiner montado e escondido: a próxima mensagem é anunciada. */
  message: string;
  className?: string;
}

const TONE = {
  success: "text-service",
  error: "text-danger",
  info: "text-meta",
} as const;

/**
 * Região viva de formulário (item 39): o contêiner fica sempre no DOM, mesmo sem mensagem,
 * porque o leitor de tela só anuncia mudanças numa região que já existia. Vazia, some da tela
 * com `empty:hidden`.
 *
 * ```tsx
 * <FormStatus id="conta-status" tone={state.ok ? "success" : "error"} message={state.message ?? ""} />
 * ```
 */
export function FormStatus({ id, tone, message, className }: FormStatusProps) {
  return (
    <p
      id={id}
      role={tone === "error" ? "alert" : "status"}
      className={cx("type-body font-semibold empty:hidden", TONE[tone], className)}
    >
      {message}
    </p>
  );
}
