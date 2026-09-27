"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { IconButton } from "./IconButton";

export interface DialogProps {
  open?: boolean;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  /** Mostra só a caixa, sem scrim nem modal (documentação e vitrine). */
  inline?: boolean;
  className?: string;
}

/**
 * Diálogo de confirmação (sair, apagar) sobre o scrim Tinta com desfoque.
 *
 * ```tsx
 * <Dialog open={open} title="Tem certeza de que deseja sair?" onClose={close}
 *   actions={<><Button size="md" onClick={close}>Cancelar</Button><Button variant="danger" onClick={logout}>Sair</Button></>} />
 * ```
 * - `<dialog>` nativo com `showModal()`: foco preso, Esc fecha, camada superior do navegador
 *   (sem z-index). Clique no scrim também fecha.
 */
export function Dialog({
  open = true,
  title,
  children,
  actions,
  onClose,
  inline = false,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || inline) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open, inline]);

  if (!open) return null;

  const box = (
    <div
      className={cx(
        "relative w-full max-w-sm rounded-xl bg-card-white px-6 pt-12 pb-6 text-center shadow-dialog",
        inline && className,
      )}
    >
      {onClose && (
        <span className="absolute top-2 right-2">
          <IconButton icon="x" variant="ghost" size={44} label={UI.close} onClick={onClose} />
        </span>
      )}
      {title && (
        <h2 id={titleId} className="text-18 font-semibold leading-snug text-strong">
          {title}
        </h2>
      )}
      {children && <div className="mt-2.5 type-body text-meta">{children}</div>}
      {actions && <div className="mt-6 flex flex-col items-center gap-4">{actions}</div>}
    </div>
  );

  if (inline) {
    return (
      <div role="dialog" aria-labelledby={title ? titleId : undefined}>
        {box}
      </div>
    );
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      onClose={() => onClose?.()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      className={cx(
        "m-auto w-full max-w-sm bg-transparent p-8 backdrop:bg-overlay backdrop:backdrop-blur-scrim",
        "open:motion-safe:animate-fade-in",
        className,
      )}
    >
      {box}
    </dialog>
  );
}
