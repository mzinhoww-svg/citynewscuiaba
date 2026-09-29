/**
 * Ponto de extensão do pré-prompt de notificações (C09, spec 2026-09-28 §7.4): seguir fonte,
 * editoria ou assunto, criar alerta de navegador e abrir matéria urgente avisam o gatilho; o
 * `NotificationInviteSlot` ao lado decide se mostra. Nunca no carregamento da home.
 */
export type NotifInviteTrigger = "follow" | "alert" | "urgent_article";

export const NOTIF_INVITE_EVENT = "cn:notif-invite";

export function requestNotificationInvite(trigger: NotifInviteTrigger): void {
  try {
    window.dispatchEvent(new CustomEvent(NOTIF_INVITE_EVENT, { detail: { trigger } }));
  } catch {
    /* sem window */
  }
}
