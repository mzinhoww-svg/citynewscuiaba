import type { ReactNode } from "react";
import { BottomNav, SiteFooter, SiteHeader } from "@/components";
import { NAV_TEXT } from "@/content/pt-BR/nav";

export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
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
