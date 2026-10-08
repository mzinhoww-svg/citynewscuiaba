/**
 * Resultado das Server Actions do painel de fontes (FS-T6), compartilhado com os componentes
 * cliente. Puro: sem `server-only`, para o cliente ler o código sem depender do texto da mensagem.
 */
export type ActionState =
  | { ok: true; message: string; data?: unknown }
  | {
      ok: false;
      message: string;
      /** `conflict`: a fonte mudou de versão desde que a tela foi carregada (oferecer Recarregar). */
      code?: "conflict";
      fieldErrors?: Record<string, string>;
      /** O que a tela ainda pode mostrar da falha (ex.: a prévia de eventos com a situação). */
      data?: unknown;
    };

export type ActionFn = (form: FormData) => Promise<ActionState>;

export const conflictState = (message: string): ActionState => ({
  ok: false,
  code: "conflict",
  message,
});

/** Só o código decide: a mensagem pode mudar de texto sem quebrar a detecção. */
export function isConflict(state: ActionState | null | undefined): boolean {
  return !!state && !state.ok && state.code === "conflict";
}
