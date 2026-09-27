"use client";

import Link from "next/link";
import { cx } from "../cx";
import { DismissMenu } from "./DismissMenu";
import { RecommendationReason } from "./RecommendationReason";
import {
  FollowButton,
  type FollowHandler,
  type HideHandler,
  type SourceCardData,
} from "./SourceCard";
import { SourceAvatar } from "./SourceAvatar";

export interface SourceRowProps {
  source: Pick<SourceCardData, "slug" | "name" | "href" | "code" | "logo" | "reason" | "followed">;
  onFollow: FollowHandler;
  /** Sem `onHide`, a linha não oferece "Ocultar" (ex.: lista de seguidas). */
  onHide?: HideHandler;
  className?: string;
}

/**
 * Linha de "Recomendadas para você" (DESIGN.md §6): avatar 40, nome, justificativa em Azul IA e
 * Seguir de 44 px. Vai dentro de `<ul>` com divisórias; não é card.
 *
 * ```tsx
 * <ul className="flex flex-col">{list.map((s) => <SourceRow key={s.slug} source={s} onFollow={f} onHide={h} />)}</ul>
 * ```
 */
export function SourceRow({ source, onFollow, onHide, className }: SourceRowProps) {
  return (
    <li
      className={cx(
        "flex items-center gap-3 border-t border-line-subtle py-3 last:border-b",
        className,
      )}
    >
      <SourceAvatar
        name={source.name}
        code={source.code}
        image={source.logo}
        size={40}
        decorative
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={source.href}
          className="text-16 font-semibold leading-snug text-strong no-underline hover:underline hover:underline-offset-4"
        >
          {source.name}
        </Link>
        <RecommendationReason text={source.reason} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <FollowButton source={source} onFollow={onFollow} size="md" />
        {onHide && (
          <DismissMenu
            sourceName={source.name}
            onChoose={(reason) => onHide(source.slug, reason)}
          />
        )}
      </div>
    </li>
  );
}
