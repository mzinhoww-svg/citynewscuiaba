"use client";

import Link from "next/link";
import { useId } from "react";
import { SOURCE_TEXT } from "@/content/pt-BR/recommendations";
import type { DismissReason } from "@/lib/anon/types";
import { formatWhen } from "@/lib/format/date";
import { formatReach, type TrendDirection } from "@/lib/ranking/signals";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { Panel } from "../ui/Panel";
import { DismissMenu } from "./DismissMenu";
import { RecommendationReason } from "./RecommendationReason";
import { SourceAvatar } from "./SourceAvatar";

/** Dados prontos de uma fonte para card e linha (a tela monta a partir de `SourceEntry`). */
export interface SourceCardData {
  slug: string;
  name: string;
  href: string;
  /** Monograma (2 letras) quando não há logotipo licenciado. */
  code?: string;
  /** Logotipo licenciado. */
  logo?: string;
  /** Editoria principal, por extenso ("Política"). */
  category: string;
  /** Localidade por extenso ("Cuiabá"). */
  locality: string;
  /** Justificativa pronta (`explainRecommendation`). */
  reason: string;
  /** Sessões em 30 dias; aparece só aproximado ("~18 mil"). */
  reach: number;
  trend: TrendDirection;
  itemsToday: number;
  updatedAt: string | null;
  /** Sem item novo há 3 h ou mais: "Sem atualização há 3 h" (P14). */
  stale?: boolean;
  verified?: boolean;
  /** Escolhida pelo leitor. */
  preferred?: boolean;
  followed?: boolean;
}

export type FollowHandler = (slug: string, next: boolean) => void;
export type HideHandler = (slug: string, reason: DismissReason) => void;

export interface SourceCardProps {
  source: SourceCardData;
  onFollow: FollowHandler;
  onHide: HideHandler;
  /** Relógio para "há 12 min" (testes e renderização estável). */
  now?: Date;
  className?: string;
}

const TREND_ICON: Record<TrendDirection, IconName> = {
  up: "trending-up",
  stable: "move-right",
  down: "trending-down",
};

/** Selos PREFERIDA e VERIFICADA em plaqueta de contorno (DESIGN.md §6). Nunca "melhor" ou estrelas. */
export function SourceBadges({
  preferred,
  verified,
  className,
}: {
  preferred?: boolean;
  verified?: boolean;
  className?: string;
}) {
  if (!preferred && !verified) return null;
  const badge =
    "inline-flex min-h-5.5 items-center gap-1 rounded-xs border border-line-strong px-1.5 py-0.5 type-eyebrow text-strong";
  return (
    <ul aria-label={SOURCE_TEXT.badgesLabel} className={cx("flex flex-wrap gap-1.5", className)}>
      {preferred && (
        <li data-testid="source-badge" className={badge}>
          {SOURCE_TEXT.badges.preferred}
        </li>
      )}
      {verified && (
        <li data-testid="source-badge" className={badge}>
          {SOURCE_TEXT.badges.verified}
        </li>
      )}
    </ul>
  );
}

/** Botão Seguir/Seguindo: nome acessível fixo ("Seguir X") e estado em `aria-pressed`. */
export function FollowButton({
  source,
  onFollow,
  size,
}: {
  source: Pick<SourceCardData, "slug" | "name" | "followed">;
  onFollow: FollowHandler;
  size: "sm" | "md";
}) {
  const followed = source.followed ?? false;
  return (
    <Button
      size={size}
      variant={followed ? "outline-strong" : "primary"}
      icon={followed ? "check" : "plus"}
      pressed={followed}
      aria-label={SOURCE_TEXT.followLabel(source.name)}
      onClick={() => onFollow(source.slug, !followed)}
    >
      {followed ? SOURCE_TEXT.following : SOURCE_TEXT.follow}
    </Button>
  );
}

/**
 * Card enxuto da grade de "Fontes em destaque" (DESIGN.md §6, spec UI §3, UI-T10): avatar 56,
 * nome, editoria · localidade, uma justificativa, Seguir e Ver matérias. Números (alcance
 * aproximado, tendência de 7 dias, matérias hoje, atualização) e selos ficam em "Detalhes";
 * "Ocultar" fica no menu ⋯ do canto (a tela oferece "Desfazer").
 *
 * ```tsx
 * <SourceCard source={data} onFollow={toggleFollow} onHide={hide} />
 * ```
 * - O card não é um link inteiro: o nome e "Ver matérias" levam à página da fonte.
 * - Nunca mostra contagem exata de leitores, "melhor", "top" ou estrelas.
 */
export function SourceCard({ source, onFollow, onHide, now, className }: SourceCardProps) {
  const titleId = useId();
  const updated = source.updatedAt ? formatWhen(source.updatedAt, now) : "";
  return (
    <Panel as="article" aria-labelledby={titleId} className={cx("flex flex-col gap-3", className)}>
      <div className="flex items-start gap-3">
        <SourceAvatar
          name={source.name}
          code={source.code}
          image={source.logo}
          size={56}
          decorative
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 id={titleId} className="type-headline-sm text-strong">
            <Link
              href={source.href}
              className="text-strong no-underline hover:underline hover:underline-offset-4"
            >
              {source.name}
            </Link>
          </h3>
          <p className="type-meta text-meta">
            {source.category} · {source.locality}
          </p>
        </div>
        <DismissMenu
          sourceName={source.name}
          onChoose={(reason) => onHide(source.slug, reason)}
          className="-mt-2 -mr-2"
        />
      </div>

      <RecommendationReason text={source.reason} />

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <FollowButton source={source} onFollow={onFollow} size="sm" />
        <Button
          variant="outline"
          size="sm"
          href={source.href}
          aria-label={SOURCE_TEXT.seeItemsLabel(source.name)}
        >
          {SOURCE_TEXT.seeItems}
        </Button>
      </div>

      <details className="group border-t border-line-subtle">
        <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-2 type-meta font-semibold text-strong [&::-webkit-details-marker]:hidden">
          {SOURCE_TEXT.details}
          <Icon
            name="chevron-down"
            size={16}
            className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="flex flex-col gap-3 pb-1">
          <SourceBadges preferred={source.preferred} verified={source.verified} />
          <dl
            aria-label={SOURCE_TEXT.statsLabel(source.name)}
            className="grid grid-cols-2 gap-x-4 gap-y-2 type-meta text-meta"
          >
            <div className="flex flex-col">
              <dt className="sr-only">{SOURCE_TEXT.reach}</dt>
              <dd className="flex items-center gap-1.5">
                <Icon name="users" size={16} />
                <span>{formatReach(source.reach)}</span>
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="sr-only">{SOURCE_TEXT.trend}</dt>
              <dd className="flex items-center gap-1.5">
                <Icon name={TREND_ICON[source.trend]} size={16} />
                <span>{SOURCE_TEXT.trendText[source.trend]}</span>
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="sr-only">{SOURCE_TEXT.today}</dt>
              <dd className="flex items-center gap-1.5">
                <Icon name="newspaper" size={16} />
                <span>{SOURCE_TEXT.todayText(source.itemsToday)}</span>
              </dd>
            </div>
            <div className="flex flex-col">
              <dt className="sr-only">{SOURCE_TEXT.updated}</dt>
              <dd className="flex items-center gap-1.5">
                <Icon name="clock" size={16} />
                {source.updatedAt ? (
                  <time dateTime={source.updatedAt}>
                    {source.stale
                      ? SOURCE_TEXT.staleText(updated)
                      : SOURCE_TEXT.updatedText(updated)}
                  </time>
                ) : (
                  <span>{SOURCE_TEXT.neverUpdated}</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </details>
    </Panel>
  );
}
