import { ARTICLE } from "@/content/pt-BR/portal-article";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface ReviewBannerProps {
  className?: string;
}

/**
 * Aviso no topo da matéria que recebeu várias denúncias (A9): "Esta matéria está em revisão".
 * Texto simples, sem explicação e sem rótulo de origem; a matéria continua no ar. Some quando a
 * pessoa da moderação resolve o item no Estúdio.
 *
 * ```tsx
 * {a.reviewBanner && <ReviewBanner />}
 * ```
 */
export function ReviewBanner({ className }: ReviewBannerProps) {
  return (
    <aside
      aria-label={ARTICLE.reviewBannerLabel}
      data-review-banner
      className={cx(
        "flex items-center gap-3 border-l-2 border-line-strong bg-section px-4 py-3 type-meta font-bold text-strong",
        className,
      )}
    >
      <Icon name="circle-alert" size={20} className="shrink-0" />
      <p>{ARTICLE.reviewBanner}</p>
    </aside>
  );
}
