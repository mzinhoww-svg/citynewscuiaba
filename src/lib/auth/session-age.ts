/**
 * Duração máxima da sessão da equipe (`security.session_hours`, A11). A sessão do Supabase Auth
 * renova o token sozinha; o limite vale desde o último acesso de verdade (`last_sign_in_at`,
 * que só muda quando a pessoa entra) e, vencido, tira o papel da sessão (falha fechada) até
 * entrar de novo. Puro.
 */
export const DEFAULT_SESSION_HOURS = 12;

export function sessionExpired(
  lastSignInAt: string | null | undefined,
  hours: number,
  now: Date,
): boolean {
  if (!lastSignInAt) return false;
  const since = new Date(lastSignInAt).getTime();
  if (!Number.isFinite(since)) return false;
  const limit = Number.isFinite(hours) && hours >= 1 ? hours : DEFAULT_SESSION_HOURS;
  return now.getTime() - since > limit * 3_600_000;
}
