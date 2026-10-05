import { parseInviteHistory, recordInvite, type InviteShown, type InviteTrigger } from "./invites";

/**
 * Onde os convites guardam o que já aconteceu neste navegador. Tudo em try/catch: com o
 * armazenamento bloqueado, o convite ainda aparece (e o painel da primeira visita não).
 * - `cn_invites` (localStorage): último convite exibido por gatilho (regra dos 7 dias).
 * - `cn_first_visit` (localStorage): o leitor já decidiu no painel da primeira visita.
 * - `cn_first_visit_later` (sessionStorage): "Agora não" no painel; volta só em outra sessão.
 * - `cn_qreads` (sessionStorage): leituras qualificadas nesta sessão. Fica só na aba, nunca
 *   sai do navegador, e some ao fechar.
 */
const HISTORY_KEY = "cn_invites";
const DECIDED_KEY = "cn_first_visit";
const READS_KEY = "cn_qreads";
export const QUALIFIED_READ_EVENT = "cn:qualified-read";

export function readInviteHistory(): InviteShown[] {
  try {
    return parseInviteHistory(window.localStorage.getItem(HISTORY_KEY));
  } catch {
    return [];
  }
}

export function noteInviteShown(trigger: InviteTrigger, now = new Date()): void {
  try {
    window.localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(recordInvite(readInviteHistory(), trigger, now)),
    );
  } catch {
    // Sem armazenamento: a regra dos 7 dias vale só enquanto a página estiver aberta.
  }
}

export function firstVisitDecided(): boolean {
  try {
    return window.localStorage.getItem(DECIDED_KEY) === "1";
  } catch {
    // Sem como lembrar a decisão, não insiste: trata como decidido.
    return true;
  }
}

export function decideFirstVisit(): void {
  try {
    window.localStorage.setItem(DECIDED_KEY, "1");
  } catch {
    // Nada a guardar.
  }
}

const LATER_KEY = "cn_first_visit_later";

/** O leitor disse "Agora não" nesta sessão? Sem armazenamento, não insiste. */
export function firstVisitLater(): boolean {
  try {
    return window.sessionStorage.getItem(LATER_KEY) === "1";
  } catch {
    return true;
  }
}

export function postponeFirstVisit(): void {
  try {
    window.sessionStorage.setItem(LATER_KEY, "1");
  } catch {
    // Nada a guardar.
  }
}

export function qualifiedReadsThisSession(): number {
  try {
    const n = Number(window.sessionStorage.getItem(READS_KEY) ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Conta uma leitura qualificada nesta aba e avisa quem escuta (painel da primeira visita). */
export function noteQualifiedRead(): void {
  try {
    window.sessionStorage.setItem(READS_KEY, String(qualifiedReadsThisSession() + 1));
    window.dispatchEvent(new Event(QUALIFIED_READ_EVENT));
  } catch {
    // Sem armazenamento de sessão: o painel não aparece.
  }
}
