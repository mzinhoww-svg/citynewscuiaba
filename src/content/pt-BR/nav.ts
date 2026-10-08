/** Navegação do portal público (docs/screens.md; DESIGN.md R10). */

export interface NavItem {
  id: string;
  label: string;
  href: string;
}

/** Destinos principais do cabeçalho no desktop (os demais ficam em `QUICK_NAV`). */
export const MAIN_NAV: readonly NavItem[] = [
  { id: "home", label: "Início", href: "/" },
  { id: "explore", label: "Explorar", href: "/explorar" },
  { id: "agenda", label: "Agenda", href: "/agenda" },
  { id: "sources", label: "Fontes", href: "/fontes" },
];

/** Atalhos em ícone do cabeçalho no desktop; no celular vêm da barra inferior. */
export const QUICK_NAV: readonly NavItem[] = [
  { id: "search", label: "Busca", href: "/busca" },
  { id: "favorites", label: "Favoritos", href: "/favoritos" },
  { id: "profile", label: "Perfil", href: "/perfil" },
];

/** Barra inferior do app (5 destinos, R10). */
export const TAB_NAV: readonly NavItem[] = [
  { id: "home", label: "Início", href: "/" },
  { id: "explore", label: "Explorar", href: "/explorar" },
  { id: "search", label: "Busca", href: "/busca" },
  { id: "favorites", label: "Favoritos", href: "/favoritos" },
  { id: "profile", label: "Perfil", href: "/perfil" },
];

/** Editorias (docs/screens.md P02). */
export const SECTIONS: readonly NavItem[] = [
  { id: "cidade", label: "Cidade", href: "/cidade" },
  { id: "politica", label: "Política", href: "/politica" },
  { id: "economia", label: "Economia", href: "/economia" },
  { id: "cultura", label: "Cultura", href: "/cultura" },
  { id: "esportes", label: "Esportes", href: "/esportes" },
  { id: "entretenimento", label: "Entretenimento", href: "/entretenimento" },
  { id: "gastronomia", label: "Gastronomia", href: "/gastronomia" },
  { id: "servicos", label: "Serviços", href: "/servicos" },
  { id: "guia-cuiaba", label: "Guia Cuiabá", href: "/guia-cuiaba" },
];

export const NAV_TEXT = {
  skipToContent: "Pular para o conteúdo",
  mainNav: "Principal",
  sectionsNav: "Editorias",
  quickNav: "Busca e conta",
  footerNav: "Institucional",
  homeLink: "CityNews Cuiabá, página inicial",
  live: "Agora",
  /** Barra de navegação pendente no topo do cabeçalho (item 87). */
  navigating: "Carregando a página",
} as const;
