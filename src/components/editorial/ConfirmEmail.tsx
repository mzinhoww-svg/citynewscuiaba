"use client";

import { useActionState } from "react";
import { CONFIRM_TEXT as T } from "@/content/pt-BR/account";
import { IDLE, type ConfirmState } from "@/lib/auth/form-state";
import { Button } from "../ui/Button";
import { InlineAlert } from "../ui/InlineAlert";

export interface ConfirmEmailProps {
  action: (state: ConfirmState, form: FormData) => Promise<ConfirmState>;
  token: string;
  type: string;
  /** Destino de "Continuar" depois de confirmar. */
  continueHref: string;
  /** Mostrado quando o link venceu (formulário de reenvio). */
  expired: React.ReactNode;
}

/** Confirmar e-mail (C05): o token só é usado quando o leitor toca no botão. */
export function ConfirmEmail({ action, token, type, continueHref, expired }: ConfirmEmailProps) {
  const [state, formAction, pending] = useActionState(action, IDLE as ConfirmState);
  if (state.status === "confirmed")
    return (
      <div className="flex flex-col gap-5">
        <InlineAlert tone="success" title={T.success}>
          <p>{T.successDetail}</p>
        </InlineAlert>
        <Button href={continueHref} fullWidth>
          {T.continue}
        </Button>
      </div>
    );
  if (state.status === "expired") return <>{expired}</>;
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="type" value={type} />
      <p className="type-body text-body">{T.pending}</p>
      {state.status === "unavailable" && (
        <InlineAlert tone="error" title={T.expired} role="alert" />
      )}
      <Button type="submit" fullWidth disabled={pending}>
        {pending ? T.busy : T.submit}
      </Button>
    </form>
  );
}
