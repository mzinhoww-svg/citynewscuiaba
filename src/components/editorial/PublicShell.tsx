import type { ReactNode } from "react";
import { NAV_TEXT } from "@/content/pt-BR/nav";
import { BottomNav } from "./BottomNav";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export interface PublicShellProps {
  children: ReactNode;
}

/**
 * Moldura das páginas públicas: "Pular para o conteúdo", cabeçalho, `<main id="conteudo">`,
 * rodapé e barra inferior no mobile. Usada pelo layout do portal e pela página 404 da raiz.
 */
export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="flex min-h-dvh flex-col pb-tabbar-safe lg:pb-0">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-tooltip focus:rounded-sm focus:bg-page focus:px-4 focus:py-3 focus:text-strong"
      >
        {NAV_TEXT.skipToContent}
      </a>
      <SiteHeader />
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <BottomNav />
    </div>
  );
}
