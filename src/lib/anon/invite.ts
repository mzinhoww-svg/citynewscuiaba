/**
 * Ponto de extensão do convite de login (spec §5.4, P2-T10). Nesta etapa não há interface:
 * as telas avisam o gatilho e o `LoginInvite` do P2-T10 vai escutar `INVITE_EVENT` (com a
 * regra de 1 convite por gatilho a cada 7 dias e "Agora não").
 */
export type InviteTrigger = "save" | "follow" | "alert" | "collection" | "sync" | "topic" | "ai";

export const INVITE_EVENT = "cn:login-invite";

export function requestLoginInvite(trigger: InviteTrigger): void {
  try {
    window.dispatchEvent(new CustomEvent(INVITE_EVENT, { detail: { trigger } }));
  } catch {
    // Sem window (servidor, testes): nada a convidar.
  }
}
