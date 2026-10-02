/*
 * Textos do portal público (P1), parte "home". `portal.ts` reexporta tudo; os componentes do
 * navegador importam daqui para levar só o que usam (B-018).
 */

export const HOME = {
  urgent: "Urgente",
  place: "Cuiabá e Várzea Grande",
  updatedAt: (hour: string) => `Atualizado às ${hour}`,
  topics: "Assuntos em destaque",
  topicsMore: "/assuntos",
  collections: "Coleções",
  collectionsMore: "/explorar",
  nearby: "Perto de você",
  nearbyText:
    "Escolha seu bairro para ver notícias, obras e eventos perto de você. Não precisa de conta.",
  nearbyCta: "Escolher bairro",
  nearbyHref: "/perfil#bairro",
  agenda: "Agenda",
  agendaMore: "/agenda",
  agendaEmpty: "Nenhum evento confirmado nos próximos dias.",
  free: "Gratuito",
  price: (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  services: "Serviços",
  servicesMore: "/servicos",
  mostRead: "Mais lidas em Cuiabá",
  mostReadTag: "Popular em Cuiabá",
  sources: "Fontes em destaque",
  sourcesMore: "/fontes",
  aggregatedTitle: "Veja também em outros portais",
  aggregatedNotice:
    "Links para matérias de outros veículos. O CityNews não republica esses textos: eles abrem no site de origem.",
  aggregatedMore: "Ver Panorama de fontes",
  sectionMore: (name: string) => `Mais de ${name}`,
  emptyTitle: "CityNews Cuiabá",
  emptyText: "Ainda não há matérias publicadas. Enquanto isso, veja a agenda da cidade.",
  errorTitle: "CityNews Cuiabá",
  errorText:
    "Não conseguimos carregar as notícias agora. A agenda e as páginas da cidade continuam disponíveis.",
  retry: "Tentar de novo",
  seeAgenda: "Ver agenda",
  loading: "Carregando notícias",
} as const;

/** Atalhos de serviço da home (P01): destinos fixos, sem depender do banco. */
export const HOME_SERVICES = [
  {
    href: "/servicos?sub=clima",
    title: "Clima e qualidade do ar",
    description: "Alertas da Defesa Civil e previsão",
    icon: "sun",
  },
  {
    href: "/guia-cuiaba",
    title: "Ônibus e trânsito",
    description: "Linhas, desvios e obras",
    icon: "map-pin",
  },
  {
    href: "/servicos",
    title: "Vagas e cursos",
    description: "Mutirões de emprego e inscrições",
    icon: "users",
  },
  {
    href: "/agenda",
    title: "O que fazer",
    description: "Eventos gratuitos e pagos da semana",
    icon: "calendar",
  },
] as const;
