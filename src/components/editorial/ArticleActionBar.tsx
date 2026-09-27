import type { CSSProperties } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface ArticleActionBarProps {
  saved?: boolean;
  /** Marcou a matéria como útil. */
  useful?: boolean;
  /** Progresso de leitura, 0 a 1. */
  progress?: number;
  onSave?: () => void;
  onShare?: () => void;
  /** Abre Ajustar leitura (tamanho do texto, tema). */
  onAdjust?: () => void;
  onUseful?: () => void;
  /** Abre Informar problema. */
  onReport?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Barra fixa no pé do leitor de matéria: linha de progresso de leitura (Urucum) e as ações
 * Salvar, Compartilhar, Ajustar leitura, Útil e Informar problema (R8).
 *
 * ```tsx
 * <ArticleActionBar progress={0.35} saved onShare={openShare} onAdjust={openReading} onReport={openReport} />
 * ```
 * - Sem curtidas nem comentários (spec D15). Estados alternáveis usam `aria-pressed`.
 */
export function ArticleActionBar({
  saved = false,
  useful = false,
  progress = 0,
  onSave,
  onShare,
  onAdjust,
  onUseful,
  onReport,
  className,
  style,
}: ArticleActionBarProps) {
  const actions: {
    label: string;
    short: string;
    icon: IconName;
    onClick?: () => void;
    pressed?: boolean;
  }[] = [
    { label: UI.save, short: UI.save, icon: "bookmark", onClick: onSave, pressed: saved },
    { label: UI.share, short: UI.share, icon: "share-2", onClick: onShare },
    { label: UI.adjustReading, short: UI.adjustReadingShort, icon: "type", onClick: onAdjust },
    { label: UI.useful, short: UI.useful, icon: "thumbs-up", onClick: onUseful, pressed: useful },
    { label: UI.report, short: UI.reportShort, icon: "flag", onClick: onReport },
  ];
  const pct = Math.min(1, Math.max(0, progress)) * 100;
  return (
    <div
      className={cx("relative border-t border-line-subtle bg-card-white pb-safe", className)}
      style={style}
    >
      <div
        aria-hidden="true"
        className="absolute -top-px left-0 h-0.75 bg-accent transition-[width] duration-(--dur-base)"
        style={{ width: `${pct}%` }}
      />
      <div
        role="toolbar"
        aria-label={UI.articleActions}
        className="flex h-tabbar items-stretch px-2"
      >
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            aria-label={a.label}
            aria-pressed={a.pressed}
            onClick={a.onClick}
            className={cx(
              "flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-md text-12 font-medium leading-none",
              a.pressed ? "text-link" : "text-meta hover:text-strong",
            )}
          >
            <Icon name={a.icon} size={22} fill={a.pressed ? "currentColor" : "none"} />
            <span aria-hidden="true">{a.short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
