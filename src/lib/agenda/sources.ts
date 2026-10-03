import type { AgendaSource } from "./types";

/**
 * Fontes de eventos de Cuiabá e Várzea Grande. Ordem = prioridade na duplicidade (oficial antes de
 * organizador). Para incluir uma fonte: confira `robots.txt` e os termos do site, registre em
 * `note` e acrescente aqui; `enabled: false` desliga sem apagar. O coletor lê só título, data,
 * local, preço e link; descrição, imagem e texto longo nunca são copiados.
 */
export const AGENDA_SOURCES: readonly AgendaSource[] = [
  {
    id: "sympla-cuiaba-1",
    name: "Sympla · Cuiabá",
    kind: "sympla",
    url: "https://www.sympla.com.br/eventos/cuiaba-mt",
    origin: "organizer",
    requireCity: true,
    enabled: true,
    note: "Página pública de busca; robots.txt com Allow: / (verificado em 2026-10-03). Confirmar termos de uso antes de ampliar a frequência.",
  },
  {
    id: "sympla-cuiaba-2",
    name: "Sympla · Cuiabá (página 2)",
    kind: "sympla",
    url: "https://www.sympla.com.br/eventos/cuiaba-mt?page=2",
    origin: "organizer",
    requireCity: true,
    enabled: true,
    note: "Idem Sympla · Cuiabá.",
  },
  {
    id: "sympla-varzea-grande",
    name: "Sympla · Várzea Grande",
    kind: "sympla",
    url: "https://www.sympla.com.br/eventos/varzea-grande-mt",
    origin: "organizer",
    requireCity: true,
    enabled: true,
    note: "Idem Sympla · Cuiabá.",
  },
];

/**
 * Fontes fictícias do modo de fixtures (`CRAWLER_FIXTURES=1`, nunca em produção): exercitam
 * JSON-LD, iCal, RSS e a lista da Sympla sem rede.
 */
export const FIXTURE_AGENDA_SOURCES: readonly AgendaSource[] = [
  {
    id: "culturavarzea",
    name: "Secretaria de Cultura de Várzea Grande (fictícia)",
    kind: "ical",
    url: "https://culturavarzea.example/calendario.ics",
    origin: "official",
    enabled: true,
  },
  {
    id: "cerrado-vivo",
    name: "Casa Cerrado Vivo (fictícia)",
    kind: "jsonld",
    url: "https://cerradovivo.example/",
    origin: "organizer",
    enabled: true,
  },
  {
    id: "agendamt",
    name: "Agenda MT (fictícia)",
    kind: "rss",
    url: "https://agendamt.example/feed",
    origin: "organizer",
    defaultNeighborhood: "Centro Sul",
    enabled: true,
  },
  {
    id: "ingressosmt",
    name: "Ingressos MT (fictícia)",
    kind: "sympla",
    url: "https://ingressosmt.example/eventos/cuiaba-mt",
    origin: "organizer",
    requireCity: true,
    enabled: true,
  },
  {
    id: "bloqueado-agenda",
    name: "Site que proíbe robôs (fictícia)",
    kind: "jsonld",
    url: "https://bloqueado-agenda.example/",
    origin: "organizer",
    enabled: true,
  },
];
