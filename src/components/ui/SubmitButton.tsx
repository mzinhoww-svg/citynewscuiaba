"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./Button";

export type SubmitButtonProps = Omit<ButtonProps, "type" | "loading" | "loadingLabel"> & {
  /** Texto durante o envio ("Salvando…" por padrão). */
  pendingLabel?: string;
};

/**
 * Botão de envio que lê o estado do `<form>` pai (`useFormStatus`): durante o envio fica
 * desabilitado, com `aria-busy` e o texto de carregamento, e o segundo clique não reenvia.
 *
 * ```tsx
 * <form action={save}>
 *   …
 *   <SubmitButton>Salvar</SubmitButton>
 * </form>
 * ```
 */
export function SubmitButton({ pendingLabel, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" loading={pending} loadingLabel={pendingLabel} />;
}
