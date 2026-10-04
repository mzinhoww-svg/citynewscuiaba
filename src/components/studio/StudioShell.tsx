import Link from "next/link";
import type { ReactNode } from "react";
import { NAV_TEXT } from "@/content/pt-BR/nav";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Logo } from "../editorial/Logo";
import type { IconName } from "../ui/Icon";
import { StudioMobileNav, StudioPageTitle } from "./StudioMobileNav";
import { StudioNav } from "./StudioNav";

export interface StudioNavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Marca como atual só na rota exata (a entrada do Estúdio). */
  exact?: boolean;
  /** Pendências do item (exceções, denúncias vencidas…); ausente ou zero = sem contagem. */
  count?: number;
  /** Como a contagem é lida: "3 pendentes" (padrão) ou "2 vencidas". */
  countKind?: StudioNavCountKind;
  /** Item de atenção (Contingência): rótulo em destaque. */
  emphasis?: boolean;
  /**
   * Subgrupo dentro do grupo (Control Center: Operação, IA, Fontes e regras). Itens do mesmo
   * subgrupo vêm juntos; itens sem subgrupo aparecem antes, sem título.
   */
  subgroup?: string;
}

export type StudioNavCountKind = "pending" | "overdue";

export interface StudioNavGroup {
  label: string;
  /** Lista plana, na ordem de exibição; os subgrupos saem de `StudioNavItem.subgroup`. */
  items: StudioNavItem[];
}

export interface StudioUser {
  name: string;
  /** Papéis já traduzidos ("Editor-chefe · Revisor"). */
  role: string;
}

export interface StudioShellProps {
  /** Grupos já filtrados pelo papel (Redação, Control Center, Administração). */
  nav: StudioNavGroup[];
  user: StudioUser;
  /** Sino da central de notificações (Client Component injetado pelo layout; visível em todas as páginas). */
  bell?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Casca do Estúdio: cabeçalho com a assinatura e a conta, navegação lateral por grupo e área
 * de trabalho. Abaixo de `lg` a navegação vira gaveta (botão Menu) e o cabeçalho mostra o nome
 * da tela atual; a conta fica dentro da gaveta. A navegação chega filtrada pelo papel; o
 * componente não conhece o banco.
 */
export function StudioShell({ nav, user, bell, children, className }: StudioShellProps) {
  return (
    <div className={cx("min-h-dvh bg-section", className)}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-tooltip focus:rounded-sm focus:bg-page focus:px-4 focus:py-3"
      >
        {NAV_TEXT.skipToContent}
      </a>
      <header
        data-sticky="studio"
        className="sticky top-0 z-sticky flex items-center gap-2 border-b border-line-subtle bg-page py-1 pr-2 pl-1 pt-[max(0.25rem,env(safe-area-inset-top))] sm:px-gutter lg:gap-4"
      >
        <StudioMobileNav nav={nav} user={user} className="lg:hidden" />
        <Link
          href="/estudio"
          className="flex min-h-tap shrink-0 items-center gap-2 rounded-xs px-1 no-underline"
        >
          <Logo variant="symbol" size="sm" decorative />
          <span className="sr-only type-nav-title text-strong lg:not-sr-only">
            {STUDIO_TEXT.name}
          </span>
        </Link>
        <StudioPageTitle nav={nav} className="min-w-0 flex-1 lg:hidden" />
        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-3">
          {bell}
          <p className="hidden min-w-0 flex-col items-end text-right type-meta text-meta lg:flex">
            <span className="sr-only">{STUDIO_TEXT.signedInAs}</span>
            <span className="max-w-full break-all font-semibold text-strong">{user.name}</span>
            <span>{user.role}</span>
          </p>
        </div>
      </header>
      <div className="lg:grid lg:grid-cols-[var(--spacing-rail)_minmax(0,1fr)]">
        <StudioNav nav={nav} search className="hidden border-r border-line-subtle lg:block" />
        <main id="conteudo" className="min-w-0 px-gutter py-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
