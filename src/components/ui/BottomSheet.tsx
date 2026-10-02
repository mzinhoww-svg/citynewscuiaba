"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cx } from "../cx";

export interface BottomSheetProps {
  open?: boolean;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  /** Mostra só a folha, sem scrim nem modal (documentação e vitrine). */
  inline?: boolean;
  className?: string;
}

/**
 * Folha inferior com alça e título centralizado (exibição, filtros, compartilhar); o rodapé
 * costuma ter um `Button` primário de largura total.
 *
 * ```tsx
 * <BottomSheet open={open} title="Exibição" onClose={close} footer={<Button fullWidth>Aplicar</Button>}>…</BottomSheet>
 * ```
 * - `<dialog>` nativo modal: foco preso, Esc fecha, entra deslizando (sem movimento com
 *   `prefers-reduced-motion`). r28 no topo, `--shadow-lg`.
 */
export function BottomSheet({
  open = true,
  title,
  children,
  footer,
  onClose,
  inline = false,
  className,
}: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || inline) return;
    if (open && !el.open) el.showModal?.();
    if (!open && el.open) el.close?.();
  }, [open, inline]);

  if (!open) return null;

  const sheet = (
    <div
      className={cx(
        "rounded-t-2xl bg-card-white px-gutter pt-3 pb-8 shadow-dialog",
        inline && className,
      )}
    >
      <div aria-hidden="true" className="mx-auto mb-4.5 h-1 w-10 rounded-pill bg-line-section" />
      {title && (
        <h2 id={titleId} className="mb-6 text-center type-nav-title text-strong">
          {title}
        </h2>
      )}
      {children}
      {footer && <div className="mt-8">{footer}</div>}
    </div>
  );

  if (inline) {
    return (
      <div role="dialog" aria-labelledby={title ? titleId : undefined}>
        {sheet}
      </div>
    );
  }
  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={title ? titleId : undefined}
      onClose={() => onClose?.()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      className={cx(
        "mx-auto mt-auto mb-0 w-full max-w-read bg-transparent p-0 backdrop:bg-overlay backdrop:backdrop-blur-scrim",
        "open:motion-safe:animate-sheet-in",
        className,
      )}
    >
      {sheet}
    </dialog>
  );
}
