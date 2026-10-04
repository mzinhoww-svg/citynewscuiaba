/**
 * Capa aprovada de verdade (R39 e R40 do dono): foto, reprodução com crédito ou ilustração
 * aprovada. Nunca cartão tipográfico nem imagem ausente. `image` já vem só de ativo aprovado
 * (`article_media` + `media_assets.status = 'approved'`); reprodução sem crédito não vale.
 */
export function hasApprovedCover(
  image: { kind: string; credit?: string | null } | null | undefined,
): boolean {
  if (!image) return false;
  if (image.kind === "reproduction") return !!image.credit?.trim();
  return true;
}
