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
  /** Atributos `data-*` da linha (posição e justificativa para o evento de clique). */
  data?: { slug: string; reason: string; position: number };
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
export function SourceRow({ source, onFollow, onHide, data, className }: SourceRowProps) {
  return (
    <li
      data-slug={data?.slug}
      data-reason={data?.reason}
      data-position={data?.position}
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line-subtle py-3 last:border-b",
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
      <div className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5">
        <Link
          href={source.href}
          className="text-16 font-semibold leading-snug text-strong no-underline hover:underline hover:underline-offset-4"
        >
          {source.name}
        </Link>
        <RecommendationReason text={source.reason} />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
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
