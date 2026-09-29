"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface SourceRowMenuProps {
  /** Nome da fonte (compõe o nome acessível do gatilho e do menu). */
  name: string;
  href: string;
  canCollectNow: boolean;
  canPause: boolean;
  canResume: boolean;
  busy?: boolean;
  onCollectNow: () => void;
  onPauseResume: () => void;
  align?: "left" | "right";
  className?: string;
}

const ITEM_CLASS =
  "flex min-h-tap w-full cursor-pointer items-center gap-2 px-4 text-left text-16 text-strong no-underline hover:bg-section focus-visible:bg-section disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Menu de ações por fonte (spec §8, O03: "menu de ações (Coletar agora, Pausar/Retomar, Abrir)"),
 * gatilho "⋯" único por linha — substitui o grupo de botões sempre visível (achado da revisão
 * FS-T7 fix round 1, também reduz a largura da linha na tabela).
 *
 * ```tsx
 * <SourceRowMenu name="Folha do Cerrado" href="/estudio/control/fontes/1" canCollectNow canPause
 *   onCollectNow={collect} onPauseResume={toggle} />
 * ```
 * - Padrão de botão de menu (WAI-ARIA): `aria-haspopup="menu"`, ↓/↑ abrem com foco no primeiro/
 *   último item; ↑ ↓ Home End navegam dentro do menu; Esc e clique fora fecham e devolvem o foco
 *   ao gatilho.
 */
export function SourceRowMenu({
  name,
  href,
  canCollectNow,
  canPause,
  canResume,
  busy = false,
  onCollectNow,
  onPauseResume,
  align = "right",
  className,
}: SourceRowMenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const collectRef = useRef<HTMLButtonElement>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const openLinkRef = useRef<HTMLAnchorElement>(null);

  const showPauseResume = canPause || canResume;
  // Ordem real dos itens visíveis (para Home/End/setas e para focar o item certo ao abrir).
  const itemRefs = [
    ...(canCollectNow ? [collectRef] : []),
    ...(showPauseResume ? [pauseRef] : []),
    openLinkRef,
  ];
  const count = itemRefs.length;

  useEffect(() => {
    if (open) itemRefs[active]?.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemRefs é recriado a cada render
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
      openAt(count - 1);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = count - 1;
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

  let index = -1;
  const collectIndex = canCollectNow ? ++index : -1;
  const pauseIndex = showPauseResume ? ++index : -1;
  const openIndex = ++index;

  return (
    <div ref={rootRef} className={cx("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={T.rowActions.menuFor(name)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={onTriggerKey}
        className="hit-area flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-pill border border-line-control bg-card-white text-strong hover:bg-section"
      >
        <Icon name="ellipsis-vertical" size={18} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={T.rowActions.menuFor(name)}
          onKeyDown={onMenuKey}
          className={cx(
            "absolute top-full z-dropdown mt-1 flex w-52 flex-col rounded-md border border-line-control bg-card-white py-1 shadow-dialog",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {canCollectNow && (
            <button
              ref={collectRef}
              type="button"
              role="menuitem"
              tabIndex={collectIndex === active ? 0 : -1}
              disabled={busy}
              onClick={() => {
                close(true);
                onCollectNow();
              }}
              className={ITEM_CLASS}
            >
              <Icon name="refresh-cw" size={16} />
              {T.rowActions.collectNow}
            </button>
          )}
          {showPauseResume && (
            <button
              ref={pauseRef}
              type="button"
              role="menuitem"
              tabIndex={pauseIndex === active ? 0 : -1}
              disabled={busy}
              onClick={() => {
                close(true);
                onPauseResume();
              }}
              className={ITEM_CLASS}
            >
              <Icon name="circle-pause" size={16} />
              {canResume ? T.rowActions.resume : T.rowActions.pause}
            </button>
          )}
          <Link
            ref={openLinkRef}
            href={href}
            role="menuitem"
            tabIndex={openIndex === active ? 0 : -1}
            onClick={() => close(false)}
            className={ITEM_CLASS}
          >
            <Icon name="external-link" size={16} />
            {T.rowActions.open}
          </Link>
        </div>
      )}
    </div>
  );
}
