import { InlineAlert } from "../ui/InlineAlert";

export interface AdminFlashProps {
  /** Texto de sucesso (já resolvido no servidor a partir de uma chave conhecida). */
  ok?: string | null;
  /** Texto de erro, idem. */
  error?: string | null;
}

/** Resultado da última ação, no topo da tela (o endereço só leva chaves, nunca texto livre). */
export function AdminFlash({ ok, error }: AdminFlashProps) {
  return (
    <>
      {ok && (
        <InlineAlert tone="success" role="status">
          {ok}
        </InlineAlert>
      )}
      {error && (
        <InlineAlert tone="error" role="alert">
          {error}
        </InlineAlert>
      )}
    </>
  );
}
