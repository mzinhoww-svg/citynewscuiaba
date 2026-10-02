/** Força da senha (C03), sem dependências: roda no navegador enquanto o leitor digita. */
export const MIN_PASSWORD = 8;

export type PasswordLevel = "short" | "weak" | "fair" | "strong";

const STRENGTH_TEXT: Record<PasswordLevel, string> = {
  short: `Muito curta: use pelo menos ${MIN_PASSWORD} caracteres`,
  weak: "Força da senha: fraca",
  fair: "Força da senha: razoável",
  strong: "Força da senha: forte",
};

/** C03: força da senha em texto (nunca só cor). */
export function passwordStrength(pw: string): { level: PasswordLevel; text: string } {
  if (pw.length < MIN_PASSWORD) return { level: "short", text: STRENGTH_TEXT.short };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const level: PasswordLevel =
    kinds >= 3 && pw.length >= 10 ? "strong" : kinds >= 2 ? "fair" : "weak";
  return { level, text: STRENGTH_TEXT[level] };
}
