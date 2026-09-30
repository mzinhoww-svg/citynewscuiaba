/**
 * Convite de equipe pendente (A01 contador e A02 situação): sem aceite (`accepted_at`, gravado
 * no primeiro acesso), sem revogação (`revoked_at`, quando o prazo venceu e o papel saiu) e
 * dentro de `expires_at`. A mesma regra vale nas duas telas (gate do P5, achado 14). Puro.
 */
export interface InviteState {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}

export function invitePending(inv: InviteState, now: Date = new Date()): boolean {
  if (inv.accepted_at || inv.revoked_at) return false;
  return new Date(inv.expires_at).getTime() >= now.getTime();
}
