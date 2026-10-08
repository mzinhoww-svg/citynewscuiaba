/** Monograma de até 2 letras de um nome de pessoa (avatar do Perfil). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first || !last) return "";
  const pick = parts.length === 1 ? first.slice(0, 2) : `${first.charAt(0)}${last.charAt(0)}`;
  return pick.toLocaleUpperCase("pt-BR");
}
