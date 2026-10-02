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

/** Páginas institucionais (docs/screens.md P23). */
export const FOOTER_NAV: readonly NavItem[] = [
  { id: "sobre", label: "Sobre", href: "/sobre" },
  { id: "panorama", label: "Panorama de fontes", href: "/panorama" },
  { id: "newsletter", label: "Newsletters", href: "/newsletter" },
  { id: "alertas", label: "Alertas", href: "/alertas" },
  { id: "app", label: "Baixar o app", href: "/app" },
  { id: "principios", label: "Princípios editoriais", href: "/principios-editoriais" },
  { id: "metodologia", label: "Metodologia", href: "/metodologia" },
  { id: "ia", label: "Como usamos IA", href: "/como-usamos-ia" },
  { id: "correcoes", label: "Correções", href: "/correcoes" },
  { id: "resposta", label: "Direito de resposta", href: "/direito-de-resposta" },
  { id: "privacidade", label: "Privacidade", href: "/privacidade" },
  { id: "termos", label: "Termos", href: "/termos" },
  { id: "anuncie", label: "Anuncie", href: "/anuncie" },
  { id: "contato", label: "Contato", href: "/contato" },
];

export const NAV_TEXT = {
  skipToContent: "Pular para o conteúdo",
  mainNav: "Principal",
  sectionsNav: "Editorias",
  quickNav: "Busca e conta",
  footerNav: "Institucional",
  homeLink: "CityNews Cuiabá, página inicial",
  live: "Agora",
} as const;

/** Dados institucionais pendentes (B-001). Troque `[PREENCHER]` quando o dono informar. */
export const LEGAL = {
  tagline: "O ponto da cidade. Notícia, agenda e serviço no mesmo lugar.",
  companyName: "Razão social: [PREENCHER]",
  cnpj: "CNPJ: [PREENCHER]",
  dpo: "Encarregado de dados (LGPD): [PREENCHER]",
  copyright: "© 2026 CityNews Cuiabá",
} as const;
