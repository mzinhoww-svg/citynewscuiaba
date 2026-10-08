import type { AgendaSource } from "./types";

/**
 * Fontes fictícias do modo de fixtures (`CRAWLER_FIXTURES=1`, nunca em produção): exercitam
 * JSON-LD, iCal, RSS, a lista da Sympla, a API Tribe e o caminho `ai_page` sem rede. As fontes de
 * produção ficam em `sources` (`kind = 'events'`) e são lidas por `loadEventSources`
 * (`src/lib/db/agenda-sources.ts`). Ordem igual à do banco: as que confirmam primeiro.
 */
const base: Pick<AgendaSource, "enabled" | "confirms" | "notes" | "listUrls"> = {
  enabled: true,
  confirms: false,
  notes: [],
  listUrls: [],
};
const uuid = (n: number) => `f1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const FIXTURE_AGENDA_SOURCES: readonly AgendaSource[] = [
  {
    ...base,
    id: "teatro-cerrado",
    uuid: uuid(6),
    name: "Teatro Cerrado (fictício)",
    kind: "ai_page",
    url: "https://teatro-cerrado.example/",
    origin: "organizer",
    confirms: true,
    notes: ["Cada espetáculo tem página própria com data, hora e local."],
  },
  {
    ...base,
    id: "culturavarzea",
    uuid: uuid(1),
    name: "Secretaria de Cultura de Várzea Grande (fictícia)",
    kind: "ical",
    url: "https://culturavarzea.example/calendario.ics",
    origin: "official",
  },
  {
    ...base,
    id: "cerrado-vivo",
    uuid: uuid(2),
    name: "Casa Cerrado Vivo (fictícia)",
    kind: "jsonld",
    url: "https://cerradovivo.example/",
    origin: "organizer",
  },
  {
    ...base,
    id: "agendamt",
    uuid: uuid(3),
    name: "Agenda MT (fictícia)",
    kind: "rss",
    url: "https://agendamt.example/feed",
    origin: "organizer",
    defaultNeighborhood: "Centro Sul",
  },
  {
    ...base,
    id: "ingressosmt",
    uuid: uuid(4),
    name: "Ingressos MT (fictícia)",
    kind: "sympla",
    url: "https://ingressosmt.example/eventos/cuiaba-mt",
    origin: "organizer",
    requireCity: true,
  },
  {
    ...base,
    id: "bloqueado-agenda",
    uuid: uuid(5),
    name: "Site que proíbe robôs (fictícia)",
    kind: "jsonld",
    url: "https://bloqueado-agenda.example/",
    origin: "organizer",
  },
  {
    ...base,
    id: "eventos-cerrado",
    uuid: uuid(7),
    name: "Eventos do Cerrado (fictícia)",
    kind: "tribe",
    url: "https://eventos-cerrado.example/wp-json/tribe/events/v1/events",
    origin: "organizer",
  },
];
