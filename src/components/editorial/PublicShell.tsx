import type { ReactNode } from "react";
import { NAV_TEXT } from "@/content/pt-BR/nav";
import type { Consent } from "@/lib/consent";
import { ConsentProvider } from "@/lib/consent/client";
import { BottomNav } from "./BottomNav";
import { ConsentBanner } from "./ConsentBanner";
import { LoginInviteGate, NotificationWatchers } from "./DeferredShell";
import { HideOnRoutes } from "./HideOnRoutes";
import { InstallInviteSlot } from "./InstallInviteSlot";
import { listTickerItems } from "@/lib/db/queries/ticker";
import { NavProgress } from "./NavProgress";
import { NewsTicker } from "./NewsTicker";
import { OfflineNotice } from "./OfflineNotice";
import { SwRegistrar } from "./SwRegistrar";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/** Telas de conta: o letreiro de manchetes só disputa atenção com o que a pessoa veio fazer. */
const TICKER_HIDDEN_ON = ["/perfil"] as const;

export interface PublicShellProps {
  children: ReactNode;
  /** Escolha de privacidade lida do cookie no servidor; sem ela, o navegador lê o cookie. */
  consent?: Consent;
}

/**
 * Moldura das páginas públicas: "Pular para o conteúdo", cabeçalho, `<main id="conteudo">`,
 * rodapé e barra inferior no mobile. Usada pelo layout do portal e pela página 404 da raiz.
 * O banner de consentimento vem logo depois do "Pular para o conteúdo": quem navega por
 * teclado o encontra cedo, e ele fica fixo no rodapé sem cobrir a leitura.
 */
export async function PublicShell({ children, consent }: PublicShellProps) {
  const tickerItems = await listTickerItems();
  return (
    <ConsentProvider initial={consent}>
      <div className="flex min-h-dvh flex-col pb-tabbar-safe lg:pb-0">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-tooltip focus:rounded-sm focus:bg-page focus:px-4 focus:py-3 focus:text-strong"
        >
          {NAV_TEXT.skipToContent}
        </a>
        <ConsentBanner />
        {/* Linha fina no topo do cabeçalho enquanto a próxima página carrega (item 87). */}
        <NavProgress />
        <SiteHeader />
        <HideOnRoutes prefixes={TICKER_HIDDEN_ON}>
          <NewsTicker items={tickerItems} />
        </HideOnRoutes>
        <OfflineNotice />
        <main id="conteudo" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <BottomNav />
        <LoginInviteGate />
        <InstallInviteSlot />
        <SwRegistrar />
        <NotificationWatchers />
      </div>
    </ConsentProvider>
  );
}
