"use client";

import { useId, type ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { IconButton } from "./IconButton";
import { closedByUser, useModalDialog } from "./useModalDialog";

export interface DialogProps {
  open?: boolean;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose?: () => void;
  /** Mostra só a caixa, sem scrim nem modal (documentação e vitrine). */
  inline?: boolean;
  /** Caixa larga (revisão com prévia), texto alinhado à esquerda. */
  wide?: boolean;
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
 * - Ao fechar, chama `close()` antes de desmontar e devolve o foco ao elemento que estava ativo
 *   quando abriu. O corpo é a descrição acessível (`aria-describedby`).
 */
export function Dialog({
  open = true,
  title,
  children,
  actions,
  onClose,
  inline = false,
  wide = false,
  className,
}: DialogProps) {
  const modalRef = useModalDialog();
  const titleId = useId();
  const bodyId = useId();

  if (!open) return null;
  const labelledBy = title ? titleId : undefined;
  const describedBy = children ? bodyId : undefined;

  const box = (
    <div
      className={cx(
        "relative w-full rounded-xl bg-card-white px-6 pt-12 pb-6 shadow-dialog",
        wide ? "max-w-2xl text-left" : "max-w-sm text-center",
        inline && className,
      )}
    >
      {onClose && (
        <span className="absolute top-2 right-2">
          <IconButton icon="x" variant="ghost" size={44} label={UI.close} onClick={onClose} />
        </span>
      )}
      {title && (
        <h2 id={titleId} className="type-nav-title text-strong">
          {title}
        </h2>
      )}
      {children && (
        <div id={bodyId} className="mt-2.5 type-body text-meta">
          {children}
        </div>
      )}
      {actions && <div className="mt-6 flex flex-col items-center gap-4">{actions}</div>}
    </div>
  );

  if (inline) {
    return (
      <div role="dialog" aria-labelledby={labelledBy} aria-describedby={describedBy}>
        {box}
      </div>
    );
  }
  return (
    <dialog
      ref={modalRef}
      tabIndex={-1}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClose={(e) => {
        if (closedByUser(e.currentTarget)) onClose?.();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      className={cx(
        "m-auto w-full bg-transparent p-8 backdrop:bg-overlay backdrop:backdrop-blur-scrim",
        wide ? "max-w-2xl" : "max-w-sm",
        "open:motion-safe:animate-fade-in",
        className,
      )}
    >
      {box}
    </dialog>
  );
}
