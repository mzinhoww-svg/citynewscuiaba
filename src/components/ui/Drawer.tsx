"use client";

import { useId, type ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon } from "./Icon";
import { useModalDialog } from "./useModalDialog";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Nome acessível da gaveta (e título visível, salvo com `hideTitle`). */
  title: ReactNode;
  /** Título só para leitores de tela (o topo mostra `header`). */
  hideTitle?: boolean;
  /** Conteúdo extra no topo, ao lado do botão Fechar (conta, resumo). */
  header?: ReactNode;
  side?: "left" | "right";
  children: ReactNode;
  /** Rodapé fixo (ação primária, link de saída), acima da área segura. */
  footer?: ReactNode;
  /** Nome do botão Fechar; "Fechar" por padrão. */
  closeLabel?: string;
  /** `false` quando o conteúdo cuida da própria rolagem (busca fixa sobre uma lista). */
  scrollBody?: boolean;
  className?: string;
}

/**
 * Gaveta lateral de altura total (menu do Estúdio no celular, gerar imagem, detalhes).
 *
 * ```tsx
 * <Drawer open={open} onClose={() => setOpen(false)} title="Gerar imagem" side="right"
 *   footer={<Button fullWidth>Gerar</Button>}>…</Drawer>
 * ```
 * - `<dialog>` nativo modal: foco preso, Esc e toque no scrim fecham, camada superior do
 *   navegador (sem z-index). A página atrás não rola.
 * - Fechar chama `close()` antes de desmontar e devolve o foco a quem abriu.
 * - Entra deslizando do lado de `side` (sem movimento com `prefers-reduced-motion`); topo e
 *   rodapé respeitam a área segura do aparelho.
 */
export function Drawer({
  open,
  onClose,
  title,
  hideTitle = false,
  header,
  side = "left",
  children,
  footer,
  closeLabel = UI.close,
  scrollBody = true,
  className,
}: DrawerProps) {
  const modalRef = useModalDialog({ lockScroll: true });
  const titleId = useId();

  if (!open) return null;

  return (
    <dialog
      ref={modalRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        "my-0 h-dvh max-h-none w-[min(24rem,88vw)] max-w-none bg-page p-0 text-strong shadow-dialog",
        "backdrop:bg-overlay backdrop:backdrop-blur-scrim",
        side === "left"
          ? "mr-auto ml-0 open:motion-safe:animate-drawer-in"
          : "mr-0 ml-auto open:motion-safe:animate-drawer-in-right",
        className,
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3 border-b border-line-subtle py-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-2 pl-4">
          <div className="min-w-0 flex-1 py-1">
            <h2 id={titleId} className={hideTitle ? "sr-only" : "type-nav-title text-strong"}>
              {title}
            </h2>
            {header}
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="inline-flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-pill text-meta hover:bg-hover active:bg-hover"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div
          className={cx(
            "flex min-h-0 flex-1 flex-col",
            scrollBody && "overflow-y-auto overscroll-contain",
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="border-t border-line-subtle px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
