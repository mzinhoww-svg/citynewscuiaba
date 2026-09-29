"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";
import { ACTIONS } from "@/content/pt-BR/sources-admin-detail";
import { Button } from "../../ui/Button";
import { InlineAlert } from "../../ui/InlineAlert";

/*
 * Apoio das telas Nova fonte e Fonte (FS-T8): contrato das Server Actions do painel
 * (`ActionState` de `fontes/actions.ts`, repetido aqui para os componentes não conhecerem o app),
 * envio por `useActionState` sem o reset automático de campos do `<form action>` (o texto
 * digitado nunca se perde em erro) e a mensagem de resultado com "Recarregar" no conflito.
 */

export type ActionResult<D = unknown> =
  | { ok: true; message: string; data?: D }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export type FormAction<D = unknown> = (form: FormData) => Promise<ActionResult<D>>;

/** Envia com `useActionState((_p, fd) => action(fd), null)`; `submit` roda dentro de uma transição. */
export function useFormAction<D = unknown>(action: FormAction<D>) {
  const [state, run, pending] = useActionState<ActionResult<D> | null, FormData>(
    (_prev, fd) => action(fd),
    null,
  );
  const submit = (fd: FormData) => startTransition(() => run(fd));
  return { state, pending, submit };
}

/** Versão desatualizada: a mensagem do servidor começa com "Esta fonte foi alterada por …". */
export const isConflict = (message: string): boolean => /foi alterada por/i.test(message);

export interface ActionMessageProps {
  state: ActionResult | null;
  /** `status` para sucesso e `alert` para erro, salvo indicação. */
  successRole?: "status" | "none";
  className?: string;
}

/** Resultado de uma ação: sucesso em verde, erro em vermelho; conflito de versão ganha "Recarregar". */
export function ActionMessage({ state, successRole = "status", className }: ActionMessageProps) {
  const router = useRouter();
  if (!state) return null;
  if (state.ok)
    return (
      <InlineAlert tone="success" role={successRole} {...(className ? { className } : {})}>
        {state.message}
      </InlineAlert>
    );
  const conflict = isConflict(state.message);
  return (
    <InlineAlert
      tone="error"
      role="alert"
      {...(className ? { className } : {})}
      action={
        conflict ? (
          <Button size="sm" variant="outline" icon="refresh-cw" onClick={() => router.refresh()}>
            {ACTIONS.reload}
          </Button>
        ) : undefined
      }
    >
      <p>{state.message}</p>
      {conflict && <p className="type-meta text-meta">{ACTIONS.reloadHint}</p>}
    </InlineAlert>
  );
}

/** Monta o `FormData` do formulário, com o botão que enviou (`name`/`value` do submitter). */
export function formDataOf(form: HTMLFormElement, submitter?: HTMLElement | null): FormData {
  return submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
    ? new FormData(form, submitter)
    : new FormData(form);
}
