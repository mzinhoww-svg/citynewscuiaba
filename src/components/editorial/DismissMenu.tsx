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
 * "Ocultar" com motivo (spec §7.4): botão de menu com os 4 motivos. "Não quero recomendações
 * personalizadas" desliga a personalização (quem trata é a tela).
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
        aria-label={SOURCE_TEXT.hideLabel(sourceName)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onTriggerKey}
        className="inline-flex min-h-tap cursor-pointer items-center gap-1.5 rounded-pill px-3 text-14 font-semibold text-meta hover:bg-section hover:text-strong"
      >
        <Icon name="eye-off" size={16} />
        {SOURCE_TEXT.hide}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={SOURCE_TEXT.hideMenuLabel(sourceName)}
          onKeyDown={onMenuKey}
          className="absolute top-full right-0 z-dropdown mt-1 flex w-72 flex-col rounded-md border border-line-control bg-card-white py-1 shadow-dialog"
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
      )}
    </div>
  );
}
