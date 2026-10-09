import { SOCIAL_AGENDA as S } from "@/content/pt-BR/social-agenda";
import type { PackageItem } from "./items";

/** Limite de caracteres da legenda no Instagram. */
export const INSTAGRAM_CAPTION_MAX = 2200;

function block(it: PackageItem): string {
  return [
    it.title,
    S.captionDay(it.dayLabel),
    S.captionTime(it.time),
    S.captionPlace(it.venue),
    S.captionPrice(it.price ?? "consulte a fonte"),
    ...(it.origin ? [it.origin] : []),
  ].join("\n");
}

/** Nomes das fontes das fotos usadas nos slides, sem repetir, na ordem dos slides. */
export function photoSources(items: readonly PackageItem[]): string[] {
  return [...new Set(items.flatMap((it) => (it.image ? [it.image.credit] : [])))];
}

/**
 * Legenda pronta do carrossel (spec §7): abertura, um bloco por evento (título, dia, hora,
 * local, preço e "Com informações de …"), créditos das fotos, três hashtags fixas e o aviso
 * final. Sem emoji. O título vai sempre inteiro, mesmo quando o slide teve de cortar linhas.
 * Acima de 2.200 caracteres, os blocos do fim saem ("Mais n eventos nos slides."); os créditos
 * continuam com todas as fotos dos slides.
 */
export function buildCaption(items: readonly PackageItem[], rangeLabel: string): string {
  const sources = photoSources(items);
  const tail = [
    ...(sources.length ? [S.captionPhotos(sources.join(", "))] : []),
    S.hashtags.join(" "),
    S.captionClosing,
  ];
  const compose = (shown: number) =>
    [
      S.captionIntro(rangeLabel),
      ...items.slice(0, shown).map(block),
      ...(shown < items.length ? [S.captionMore(items.length - shown)] : []),
      ...tail,
    ].join("\n\n");
  for (let shown = items.length; shown >= 0; shown--) {
    const text = compose(shown);
    if (text.length <= INSTAGRAM_CAPTION_MAX) return text;
  }
  // Nem a abertura com os créditos cabe (não acontece com 6 eventos): o aviso final fica.
  const closing = `\n\n${S.captionClosing}`;
  return (
    compose(0)
      .slice(0, INSTAGRAM_CAPTION_MAX - closing.length)
      .trimEnd() + closing
  );
}

/**
 * `creditos.txt` do ZIP: por slide de evento, a foto ("Foto: reprodução web · {fonte}" e o link
 * da página original) e a origem das informações. Slide 01 é a capa.
 */
export function creditsText(items: readonly PackageItem[]): string {
  const blocks = items.map((it, i) =>
    [
      S.creditsSlide(String(i + 2).padStart(2, "0"), it.title),
      it.image ? S.photoCreditLine(it.image.credit) : S.noPhoto,
      ...(it.image?.originUrl ? [S.creditsOriginal(it.image.originUrl)] : []),
      ...(it.origin ? [it.origin] : []),
    ].join("\n"),
  );
  return [S.creditsTitle, ...blocks, S.captionClosing].join("\n\n") + "\n";
}
