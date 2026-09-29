import { ADMIN_OPS } from "@/content/pt-BR/admin-ops";
import { InlineAlert } from "../ui/InlineAlert";

export interface AdminNoticeProps {
  /** Código de sucesso vindo do endereço (`?ok=`). */
  ok?: string | undefined;
  /** Código de erro vindo do endereço (`?erro=`). */
  erro?: string | undefined;
  /** Campo com erro de validação (configurações) e o rótulo dele. */
  campo?: string | undefined;
  campoLabel?: string | undefined;
}

const OK = ADMIN_OPS.common.ok as Record<string, string>;
const ERRO = ADMIN_OPS.common.erro as Record<string, string>;

/**
 * Resultado da última ação das telas de Administração (P5-T9): os códigos vêm do endereço e o
 * texto sai de uma lista fixa. (Restaurado pela P5-T8 depois de um choque de nome; ver A-208.)
 */
export function AdminNotice({ ok, erro, campo, campoLabel }: AdminNoticeProps) {
  const okText = ok ? OK[ok] : undefined;
  const errorText = erro
    ? campo && campoLabel
      ? `${ERRO[erro] ?? ERRO["invalid"]} ${campoLabel}.`
      : (ERRO[erro] ?? ERRO["invalid"])
    : undefined;
  return (
    <>
      {okText && (
        <InlineAlert tone="success" role="status">
          {okText}
        </InlineAlert>
      )}
      {errorText && (
        <InlineAlert tone="error" role="alert">
          {errorText}
        </InlineAlert>
      )}
    </>
  );
}
