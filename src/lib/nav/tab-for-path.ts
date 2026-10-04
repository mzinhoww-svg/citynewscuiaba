/**
 * Aba acesa da barra inferior por rota (UX-W4-T3, item 65 · P-06): toda rota pública acende
 * um dos 5 destinos (`id` de `TAB_NAV`). Rotas de descoberta (agenda, fontes, editorias, Guia…)
 * acendem Explorar; conta e inscrições acendem Perfil; matéria e institucionais, Início.
 */
export type TabId = "home" | "explore" | "search" | "favorites" | "profile";

const BY_SEGMENT: Readonly<Record<string, TabId>> = {
  materia: "home",
  explorar: "explore",
  agenda: "explore",
  fontes: "explore",
  panorama: "explore",
  assuntos: "explore",
  assunto: "explore",
  "guia-cuiaba": "explore",
  colecoes: "explore",
  // Editorias (`[editoria]`) e subeditorias: chegam pelo Explorar.
  cidade: "explore",
  politica: "explore",
  economia: "explore",
  cultura: "explore",
  esportes: "explore",
  entretenimento: "explore",
  gastronomia: "explore",
  servicos: "explore",
  seguranca: "explore",
  saude: "explore",
  clima: "explore",
  mobilidade: "explore",
  busca: "search",
  pergunte: "search",
  favoritos: "favorites",
  perfil: "profile",
  entrar: "profile",
  "criar-conta": "profile",
  confirmar: "profile",
  "recuperar-senha": "profile",
  "redefinir-senha": "profile",
  alertas: "profile",
  newsletter: "profile",
};

/** Destino da barra inferior para `pathname`; rota desconhecida ou institucional → Início. */
export function tabForPath(pathname: string): TabId {
  const path = pathname.split(/[?#]/, 1)[0] ?? "";
  const first = path.split("/").find((s) => s.length > 0);
  if (!first) return "home";
  return BY_SEGMENT[first] ?? "home";
}
