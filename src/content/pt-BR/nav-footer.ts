/**
 * Rodapé do portal (servidor). Fora de `nav.ts` porque a barra inferior e o perfil anônimo
 * importam `nav.ts` no navegador e não precisam destes textos (item 85, A-156).
 */

import { ASK_NAME } from "./ask-name";
import type { NavItem } from "./nav";

/** Páginas institucionais (docs/screens.md P23). */
export const FOOTER_NAV: readonly NavItem[] = [
  { id: "sobre", label: "Sobre", href: "/sobre" },
  { id: "panorama", label: "Panorama de fontes", href: "/panorama" },
  { id: "pergunte", label: ASK_NAME, href: "/pergunte" },
  { id: "newsletter", label: "Newsletters", href: "/newsletter" },
  { id: "alertas", label: "Alertas", href: "/alertas" },
  { id: "app", label: "Baixar o app", href: "/app" },
  { id: "principios", label: "Princípios editoriais", href: "/principios-editoriais" },
  { id: "correcoes", label: "Correções", href: "/correcoes" },
  { id: "resposta", label: "Direito de resposta", href: "/direito-de-resposta" },
  { id: "privacidade", label: "Privacidade", href: "/privacidade" },
  { id: "termos", label: "Termos", href: "/termos" },
  { id: "anuncie", label: "Anuncie", href: "/anuncie" },
  { id: "contato", label: "Contato", href: "/contato" },
];

/** Dados institucionais pendentes (B-001). Troque `[PREENCHER]` quando o dono informar. */
export const LEGAL = {
  tagline: "O ponto da cidade. Notícia, agenda e serviço no mesmo lugar.",
  companyName: "Razão social: [PREENCHER]",
  cnpj: "CNPJ: [PREENCHER]",
  dpo: "Encarregado de dados (LGPD): [PREENCHER]",
  copyright: "© 2026 CityNews Cuiabá",
} as const;
