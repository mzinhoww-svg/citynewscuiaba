"use client";

import { useState, type CSSProperties } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";

export interface TopicCardProps {
  label: string;
  icon?: IconName;
  following?: boolean;
  defaultFollowing?: boolean;
  onToggle?: (following: boolean) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Bloco de seguir/deixar de seguir editorias e bairros; 3 por linha com 12 px de espaço.
 *
 * ```tsx
 * <TopicCard label="Mobilidade" icon="map-pin" defaultFollowing />
 * ```
 * - Ícones de contorno no lugar dos emoji do template: o CityNews nunca usa emoji.
 * - O botão diz o tema no nome ("Seguir Mobilidade") e o estado em `aria-pressed`.
 */
export function TopicCard({
  label,
  icon = "newspaper",
  following,
  defaultFollowing = false,
  onToggle,
  className,
  style,
}: TopicCardProps) {
  const [inner, setInner] = useState(defaultFollowing);
  const on = following ?? inner;
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col items-center gap-2.5 rounded-lg bg-card px-2.5 py-4",
        className,
      )}
      style={style}
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-pill bg-card-white text-strong"
      >
        <Icon name={icon} size={22} />
      </span>
      <span className="text-center text-14 font-medium leading-snug text-strong">{label}</span>
      <Button
        size="sm"
        variant={on ? "outline-strong" : "primary"}
        pressed={on}
        aria-label={`${UI.follow} ${label}`}
        onClick={() => {
          if (following === undefined) setInner(!on);
          onToggle?.(!on);
        }}
        className="min-w-21"
      >
        {on ? UI.following : UI.follow}
      </Button>
    </div>
  );
}
