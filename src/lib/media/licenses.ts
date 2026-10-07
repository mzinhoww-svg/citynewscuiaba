import { MEDIA_TEXT as T } from "@/content/pt-BR/studio";
import { err, ok, type Result } from "@/lib/result";
import { fold as foldText } from "@/lib/text/fold";

export interface LicensedAsset {
  id: string;
  license: string;
  /** Último dia de uso permitido (AAAA-MM-DD); null = sem vencimento. */
  licenseUntil: string | null;
  status: "pending" | "approved" | "blocked";
  /** Matérias públicas (publicadas ou atualizadas) que usam a imagem. */
  publishedArticles: { id: string; title: string }[];
}

export interface LicenseState extends LicensedAsset {
  /** Dias até o vencimento (negativo = vencida há n dias). */
  daysLeft: number;
}

export interface LicenseAlert {
  mediaId: string;
  articleId: string;
  message: string;
}

const DAY = 86_400_000;
const dayNumber = (key: string) => Math.round(Date.parse(`${key}T12:00:00Z`) / DAY);

/**
 * Licenças que vencem em até `days` dias e as já vencidas (E11). A data é o último dia de uso:
 * vence hoje ainda vale. Imagem bloqueada fica de fora. Vencida em matéria pública gera alerta
 * com troca sugerida (Review Focus 4).
 */
export function expiringLicenses(
  assets: readonly LicensedAsset[],
  today: string,
  days = 30,
): { expiring: LicenseState[]; expired: LicenseState[]; alerts: LicenseAlert[] } {
  const t = dayNumber(today);
  const expiring: LicenseState[] = [];
  const expired: LicenseState[] = [];
  const alerts: LicenseAlert[] = [];
  for (const a of assets) {
    if (!a.licenseUntil || a.status === "blocked") continue;
    const daysLeft = dayNumber(a.licenseUntil) - t;
    if (daysLeft < 0) {
      expired.push({ ...a, daysLeft });
      for (const art of a.publishedArticles)
        alerts.push({ mediaId: a.id, articleId: art.id, message: T.expiredAlert(art.title) });
    } else if (daysLeft <= days) {
      expiring.push({ ...a, daysLeft });
    }
  }
  const byDays = (x: LicenseState, y: LicenseState) => x.daysLeft - y.daysLeft;
  return { expiring: expiring.sort(byDays), expired: expired.sort(byDays), alerts };
}

/** Temas em que ilustração gerada nunca entra (CLAUDE.md regra 9; A-021). */
const FORBIDDEN_TAGS = [
  "crime",
  "violencia",
  "morte",
  "tragedia",
  "acidente",
  "suicidio",
  "abuso",
  "saude-individual",
  "homicidio",
  "assassinato",
];
const fold = (s: string) => foldText(s).replace(/\s+/g, "-");

/**
 * Pode gerar ilustração para esta matéria? Nunca em Segurança, tema sensível ou etiqueta de
 * crime, tragédia ou saúde individual. Quando pode, devolve as restrições fixas mostradas no
 * drawer (E12) e enviadas ao gerador.
 */
export function illustrationGuard(input: {
  category: string;
  sensitive: boolean;
  tags: readonly string[];
}): Result<{ restrictions: string[] }, string> {
  const tags = input.tags.map(fold);
  if (
    fold(input.category) === "seguranca" ||
    input.sensitive ||
    tags.some((t) => FORBIDDEN_TAGS.includes(t))
  )
    return err(T.illustrationForbidden);
  return ok({ restrictions: [...T.restrictions] });
}
