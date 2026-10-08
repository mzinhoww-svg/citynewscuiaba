import { GUIDE } from "@/content/pt-BR/guide";
import type { GuidePhoto } from "@/lib/db/queries/guide";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";
import { Photo } from "../Photo";

export interface VenueCoverProps {
  name: string;
  /** Nome da categoria ("Padaria"), para o cartão tipográfico. */
  categoryLabel: string;
  photo?: GuidePhoto | undefined;
  /** card = miniatura da lista · hero = topo da página do lugar. */
  size?: "card" | "hero";
  className?: string;
}

/**
 * Foto oficial do lugar com o crédito "Foto: reprodução web · nome" e o link da fonte; sem ela, a
 * foto principal do Google com "Foto: autor · Google" e o link do autor (A-212); sem nenhuma, o
 * cartão tipográfico (nunca imagem de terceiro nem espaço vazio). A foto de hero leva
 * a legenda abaixo; na miniatura o crédito vai no texto alternativo.
 */
export function VenueCover({
  name,
  categoryLabel,
  photo,
  size = "card",
  className,
}: VenueCoverProps) {
  if (photo) {
    const caption = (
      <>
        {photo.credit}
        {" · "}
        <a
          href={photo.originUrl}
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {GUIDE.venue.photoSource}
        </a>
      </>
    );
    return (
      <figure
        data-testid="venue-photo"
        className={cx(
          "flex flex-col gap-1.5",
          size === "card" ? "w-full sm:w-52" : "w-full",
          className,
        )}
      >
        <Photo
          src={photo.src}
          alt={`Foto de ${name}`}
          ratio={size === "hero" ? "16/9" : "3/2"}
          radius="0"
          priority={size === "hero"}
          sizes={
            size === "hero" ? "(min-width: 64em) 60vw, 100vw" : "(min-width: 40em) 13rem, 100vw"
          }
        />
        <figcaption className="type-meta text-meta">{caption}</figcaption>
      </figure>
    );
  }
  return (
    <div
      data-testid="venue-typographic-cover"
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-center gap-3 border-t-4 border-cerrado bg-section px-4 text-strong",
        size === "card"
          ? "h-16 w-full sm:h-auto sm:min-h-20 sm:w-52 sm:flex-col sm:items-start sm:justify-center sm:py-4"
          : "h-16 w-full",
        className,
      )}
    >
      <Icon name="map-pin" size={size === "card" ? 20 : 24} className="shrink-0 text-service" />
      <span className="type-eyebrow">{categoryLabel}</span>
    </div>
  );
}
