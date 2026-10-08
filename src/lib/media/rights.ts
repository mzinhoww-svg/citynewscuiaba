import { PUBLIC_LABEL } from "@/content/pt-BR/labels";

/**
 * Media Registry (D-02, decisão do dono de 04/10/2026): status de direitos, escopo de uso e aviso
 * de cada ativo. Espelha a função SQL `media_rights_status_for` (migration 0152), que é quem grava;
 * esta versão serve à interface e aos testes. Ter acesso à imagem não é ter autorização: imagem da
 * web sem autorização registrada fica `unknown`, nunca `authorized`. Nada aqui inventa licença,
 * autor ou crédito: só classifica o que está registrado.
 */
export type RightsStatus =
  "authorized" | "licensed" | "unknown" | "pending" | "expired" | "blocked";
export type MediaKindForRights =
  "original" | "licensed" | "illustrative" | "ai_generated" | "reproduction";
export type UsageScope = "editorial" | "social" | "thumbnail";

/** Aviso padrão da reprodução externa (decisão do dono, D-02): o mesmo texto da legenda pública. */
export const WEB_REPRODUCTION = PUBLIC_LABEL.image.reproduction;

export interface RightsInput {
  kind: MediaKindForRights;
  status: string;
  /** `media_assets.license_until` (data ISO), quando houver validade. */
  licenseUntil: string | null;
  removedAt: string | null;
}

export function rightsStatusOf(a: RightsInput, now: Date = new Date()): RightsStatus {
  if (a.status === "blocked" || a.removedAt) return "blocked";
  if (a.licenseUntil && Date.parse(a.licenseUntil) < now.getTime()) return "expired";
  switch (a.kind) {
    case "original":
    case "ai_generated":
      return "authorized";
    case "licensed":
      return "licensed";
    default:
      return "unknown";
  }
}

/** Ativo bloqueado ou com autorização vencida nunca volta a ser escolhido. */
export const isReusable = (s: RightsStatus): boolean => s !== "blocked" && s !== "expired";

export const disclaimerFor = (kind: MediaKindForRights): string | null =>
  kind === "reproduction" ? WEB_REPRODUCTION : null;

/** Reprodução é para a matéria; compartilhamento e miniatura pedem direito próprio ou licença. */
export const usageScopeFor = (kind: MediaKindForRights): UsageScope[] =>
  kind === "reproduction" || kind === "illustrative"
    ? ["editorial"]
    : ["editorial", "social", "thumbnail"];
