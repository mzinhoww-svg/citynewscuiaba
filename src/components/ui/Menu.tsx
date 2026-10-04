"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";
import { Popover, type PopoverTriggerRender } from "./Popover";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  /** Ação que apaga ou desfaz (texto em perigo). */
  destructive?: boolean;
  icon?: IconName;
}

export interface MenuProps {
  /** Nome acessível do menu. */
  label: string;
  items: readonly MenuItem[];
  /** Desenha o gatilho: espalhe `props` e passe `ref` no `<button>` (dê a ele um nome). */
  trigger: (p: PopoverTriggerRender) => ReactNode;
  align?: "start" | "end";
  className?: string;
}

/**
 * Menu de ações sobre `Popover` (menus de linha, "Mais opções", dispensar).
 *
 * ```tsx
 * <Menu label="Ações da fonte" align="end"
 *   items={[{ label: "Editar", icon: "pencil", onSelect: edit }, { label: "Excluir", destructive: true, onSelect: remove }]}
 *   trigger={({ ref, props }) => <button ref={ref} {...props} aria-label="Mais opções">…</button>} />
 * ```
 * - Padrão de botão de menu (WAI-ARIA): `role="menu"` e `menuitem`; ↓/↑ no gatilho abrem com
 *   foco no primeiro/último item; ↑ ↓ Home End navegam (com volta); Esc fecha e devolve o foco.
 * - Escolher um item fecha o menu, devolve o foco ao gatilho e só então chama `onSelect` (um
 *   diálogo aberto pela ação devolve o foco ao mesmo gatilho).
 */
export function Menu({ label, items, trigger, align = "end", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const last = items.length - 1;

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  const openAt = (i: number) => {
    setActive(i);
    setOpen(true);
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openAt(e.key === "ArrowDown" ? 0 : last);
    }
  };

  const onPanelKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowDown: active >= last ? 0 : active + 1,
      ArrowUp: active <= 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    const next = moves[e.key];
    if (next !== undefined) {
      e.preventDefault();
      setActive(next);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <Popover
      label={label}
      role="menu"
      align={align}
      open={open}
      onOpenChange={(next) => (next ? openAt(0) : setOpen(false))}
      onTriggerKeyDown={onTriggerKeyDown}
      onPanelKeyDown={onPanelKeyDown}
      trigger={trigger}
      className={className}
      panelClassName="py-1"
    >
      {({ close }) =>
        items.map((item, i) => (
          <button
            key={item.label}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            role="menuitem"
            tabIndex={i === active ? 0 : -1}
            onFocus={() => setActive(i)}
            onClick={() => {
              close(true);
              item.onSelect();
            }}
            className={cx(
              "flex min-h-tap w-full shrink-0 cursor-pointer items-center gap-3 px-4 text-left text-16",
              "hover:bg-hover focus-visible:bg-hover",
              item.destructive ? "text-danger" : "text-strong",
            )}
          >
            {item.icon && <Icon name={item.icon} size={20} />}
            <span className="min-w-0 flex-1">{item.label}</span>
          </button>
        ))
      }
    </Popover>
  );
}
