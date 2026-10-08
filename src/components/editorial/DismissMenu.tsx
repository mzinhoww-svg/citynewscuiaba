"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DISMISS_REASON_TEXT, SOURCE_TEXT } from "@/content/pt-BR/recommendations";
import type { DismissReason } from "@/lib/anon/types";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface DismissMenuProps {
  sourceName: string;
  onChoose: (reason: DismissReason) => void;
  className?: string;
}

const REASONS = Object.keys(DISMISS_REASON_TEXT) as DismissReason[];

/**
 * "Ocultar" com motivo (spec §7.4) no menu ⋯ (UI-T10): botão só de ícone, de 44 px, com nome
 * "Mais opções de {fonte}"; o menu abre com a legenda "Ocultar esta fonte" e os 4 motivos.
 * "Não quero recomendações personalizadas" desliga a personalização (quem trata é a tela, que
 * também oferece "Desfazer").
 *
 * ```tsx
 * <DismissMenu sourceName="MT Agora" onChoose={(reason) => hide("mt-agora", reason)} />
 * ```
 * - Padrão de botão de menu (WAI-ARIA): Enter/Espaço/↓ abrem com foco no primeiro item; ↑ ↓
 *   Home End navegam; Esc e clique fora fecham e devolvem o foco ao botão.
 */
export function DismissMenu({ sourceName, onChoose, className }: DismissMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const openAt = (i: number) => {
    setActive(i);
    setOpen(true);
  };
  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      openAt(0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt(REASONS.length - 1);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = REASONS.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: active === last ? 0 : active + 1,
      ArrowUp: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={cx("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={SOURCE_TEXT.moreLabel(sourceName)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onTriggerKey}
        className="inline-flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-pill text-meta hover:bg-section hover:text-strong aria-expanded:bg-section aria-expanded:text-strong"
      >
        <Icon name="ellipsis" size={20} />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-dropdown mt-1 flex w-72 flex-col rounded-md border border-line-control bg-card-white py-1 shadow-dialog">
          <p
            aria-hidden="true"
            className="flex items-center gap-1.5 px-4 pt-2 pb-1 type-meta font-semibold text-meta"
          >
            <Icon name="eye-off" size={16} />
            {SOURCE_TEXT.hideMenuTitle}
          </p>
          <div
            id={menuId}
            role="menu"
            aria-label={SOURCE_TEXT.hideMenuLabel(sourceName)}
            onKeyDown={onMenuKey}
            className="flex flex-col"
          >
            {REASONS.map((reason, i) => (
              <button
                key={reason}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={i === active ? 0 : -1}
                onClick={() => {
                  close(true);
                  onChoose(reason);
                }}
                className="flex min-h-tap w-full cursor-pointer items-center px-4 text-left text-16 text-strong hover:bg-section focus-visible:bg-section"
              >
                {DISMISS_REASON_TEXT[reason]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
