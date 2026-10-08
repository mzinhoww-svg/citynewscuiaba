"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { cx } from "../cx";

/** Atributos que o gatilho do popover espalha no seu `<button>`. */
export interface PopoverTriggerProps {
  id: string;
  "aria-expanded": boolean;
  "aria-controls"?: string;
  "aria-haspopup": "dialog" | "menu";
  onClick: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
}

export interface PopoverTriggerRender {
  ref: RefObject<HTMLButtonElement | null>;
  props: PopoverTriggerProps;
  open: boolean;
}

export interface PopoverControls {
  /** Fecha o painel; com `focusTrigger`, o foco volta ao gatilho. */
  close: (focusTrigger?: boolean) => void;
}

export interface PopoverProps {
  /** Desenha o gatilho: espalhe `props` e passe `ref` no `<button>`. */
  trigger: (p: PopoverTriggerRender) => ReactNode;
  children: ReactNode | ((controls: PopoverControls) => ReactNode);
  /** Nome acessível do painel. */
  label: string;
  /** Lado em que o painel se alinha ao gatilho a partir de `sm` (no celular ele é fixo). */
  align?: "start" | "end";
  /**
   * Lado do gatilho em que o painel abre a partir de `sm`: abaixo (padrão) ou acima (gatilho
   * numa barra fixa no rodapé). No celular ele é fixo no topo nos dois casos.
   */
  side?: "bottom" | "top";
  /** Papel do painel: `dialog` (padrão) ou `menu` (usado por `Menu`). */
  role?: "dialog" | "menu";
  /** Controle externo (opcional); sem ele o popover guarda o próprio estado. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Teclas extras no gatilho (o `Menu` abre com as setas). */
  onTriggerKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  /** Teclas extras dentro do painel (navegação do `Menu`). */
  onPanelKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
  panelClassName?: string;
}

/**
 * Painel flutuante ancorado num botão (notificações, filtros rápidos, menus de linha).
 *
 * ```tsx
 * <Popover label="Notificações" align="end"
 *   trigger={({ ref, props }) => <button ref={ref} {...props} aria-label="Notificações">…</button>}>
 *   {({ close }) => <Painel onDone={() => close(true)} />}
 * </Popover>
 * ```
 * - Clique fora fecha; Esc fecha e devolve o foco ao gatilho; sair com Tab fecha sem mover o foco.
 * - Gatilho com `aria-expanded`, `aria-haspopup` e `aria-controls` apontando para o painel.
 * - No celular o painel é `position: fixed` com margem do gutter (como o sino do Estúdio): não
 *   estoura a tela de 320 px. A partir de `sm` ancora abaixo do gatilho, no lado de `align`.
 */
export function Popover({
  trigger,
  children,
  label,
  align = "start",
  side = "bottom",
  role = "dialog",
  open: controlled,
  onOpenChange,
  onTriggerKeyDown,
  onPanelKeyDown,
  className,
  panelClassName,
}: PopoverProps) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const panelId = useId();
  const triggerId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const setOpen = (next: boolean) => {
    if (controlled === undefined) setOwn(next);
    onOpenChange?.(next);
  };
  // Lido pelo efeito de clique fora sem reinstalar o ouvinte a cada render.
  const setOpenRef = useRef(setOpen);
  useEffect(() => {
    setOpenRef.current = setOpen;
  });

  const close = (focusTrigger = false) => {
    setOpen(false);
    // Pelo id, não pela ref: `close` vai para o conteúdo durante o render.
    if (focusTrigger) document.getElementById(triggerId)?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // O painel recebe o foco ao abrir, se o conteúdo não tiver puxado o foco para dentro.
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenRef.current(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const onEscape = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || !open) return false;
    e.preventDefault();
    e.stopPropagation();
    close(true);
    return true;
  };

  const props: PopoverTriggerProps = {
    id: triggerId,
    "aria-expanded": open,
    "aria-controls": open ? panelId : undefined,
    "aria-haspopup": role,
    onClick: () => setOpen(!open),
    onKeyDown: (e) => {
      if (onEscape(e)) return;
      onTriggerKeyDown?.(e);
    },
  };

  return (
    <div
      ref={rootRef}
      className={cx("relative inline-flex", className)}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (open && next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      {trigger({ ref: triggerRef, props, open })}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role={role}
          aria-label={label}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (onEscape(e)) return;
            onPanelKeyDown?.(e);
          }}
          className={cx(
            "fixed inset-x-4 top-16 z-dropdown flex max-h-[min(36rem,80dvh)] flex-col overflow-y-auto",
            "rounded-md border border-line-control bg-card-white shadow-dialog",
            "sm:absolute sm:inset-x-auto sm:w-max sm:max-w-[26rem] sm:min-w-56",
            side === "top" ? "sm:top-auto sm:bottom-full sm:mb-2" : "sm:top-full sm:mt-2",
            align === "end" ? "sm:right-0" : "sm:left-0",
            "motion-safe:animate-fade-in",
            panelClassName,
          )}
        >
          {typeof children === "function" ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
