/**
 * Ponto de extensão do convite de login (spec §5.4). As telas avisam o gatilho e o
 * `LoginInvite` (P2-T10) decide se mostra: 1 convite por gatilho a cada 7 dias, nunca para quem
 * já entrou, sempre com "Agora não". `explicit` é o pedido direto do leitor (tocar em
 * "Sincronizar"): mostra mesmo dentro dos 7 dias.
 */
export type InviteTrigger = "save" | "follow" | "alert" | "collection" | "sync" | "topic" | "ai";

export const INVITE_EVENT = "cn:login-invite";

export interface InviteRequest {
  trigger: InviteTrigger;
  explicit?: boolean;
}

export function requestLoginInvite(
  trigger: InviteTrigger,
  opts: { explicit?: boolean } = {},
): void {
  try {
    const detail: InviteRequest = { trigger, ...(opts.explicit ? { explicit: true } : {}) };
    window.dispatchEvent(new CustomEvent(INVITE_EVENT, { detail }));
  } catch {
    // Sem window (servidor, testes): nada a convidar.
  }
}
