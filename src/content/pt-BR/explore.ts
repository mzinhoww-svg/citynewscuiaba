import type { IconName } from "@/components";

/** Explorar (P07) e coleção (P08). */
export const EXPLORE = {
  metaTitle: "Explorar · CityNews Cuiabá",
  metaDescription:
    "Editorias, assuntos em destaque, coleções, agenda e serviços de Cuiabá, sem precisar de conta.",
  title: "Explorar",
  intro: "Tudo o que o CityNews cobre em Cuiabá e Várzea Grande, sem personalização.",
  onThisPage: "Nesta página",
  sections: "Editorias",
  today: (n: number) =>
    n === 0 ? "Nenhuma matéria hoje" : n === 1 ? "1 matéria hoje" : `${n} matérias hoje`,
  topics: "Assuntos em destaque",
  topicsMore: "/assuntos",
  topicsEmpty: "Nenhum assunto em andamento agora.",
  collections: "Coleções",
  collectionsEmpty: "Nenhuma coleção publicada ainda.",
  mostRead: "Mais lidas da semana",
  shortcuts: "Fontes e agenda",
  sources: "Fontes",
  sourcesText: "Veículos de Cuiabá e de Mato Grosso, com a origem de cada notícia.",
  agenda: "Agenda",
  agendaText: "Shows, feiras, teatro e esporte na cidade, com os gratuitos em destaque.",
  app: "Baixar o app",
  appText: "Instale o CityNews na tela inicial: abre mais rápido e funciona sem internet.",
  guide: "Guia Cuiabá",
  guideMore: "/guia-cuiaba",
  errorTitle: "Não conseguimos carregar o Explorar agora",
  errorText: "Pode ser uma instabilidade passageira. As editorias continuam no menu.",
  retry: "Tentar de novo",
  loading: "Carregando o Explorar",
} as const;

/** Ícone de cada editoria no Explorar (traço Lucide, decorativo). */
export const SECTION_ICONS: Record<string, IconName> = {
  cidade: "house",
  politica: "scale",
  economia: "trending-up",
  cultura: "book-open",
  esportes: "flag",
  entretenimento: "play",
  gastronomia: "flame",
  servicos: "sun",
  "guia-cuiaba": "compass",
};

/** Guia Cuiabá no Explorar: serviços que não envelhecem, destinos fixos. */
export const GUIDE_LINKS = [
  {
    href: "/guia-cuiaba",
    title: "Ônibus e trânsito",
    description: "Linhas, desvios e obras",
    icon: "map-pin",
  },
  {
    href: "/servicos?sub=clima",
    title: "Clima e qualidade do ar",
    description: "Alertas da Defesa Civil e previsão",
    icon: "sun",
  },
  {
    href: "/servicos",
    title: "Vagas e cursos",
    description: "Mutirões de emprego e inscrições",
    icon: "users",
  },
  {
    href: "/agenda?gratuito=1",
    title: "Programação gratuita",
    description: "Eventos sem custo na cidade",
    icon: "ticket",
  },
] as const satisfies readonly {
  href: string;
  title: string;
  description: string;
  icon: IconName;
}[];

export const COLLECTION = {
  metaTitle: (title: string) => `${title} · Coleções · CityNews Cuiabá`,
  eyebrow: "Coleção",
  curatedBy: (name: string) => `Curadoria de ${name}`,
  curatedByNewsroom: "Curadoria da redação do CityNews",
  updated: "Atualizada em ",
  items: "Itens da coleção",
  count: (n: number) => (n === 1 ? "1 item" : `${n} itens`),
  kinds: { article: "Matéria", topic: "Assunto", event: "Evento", aggregated: "Outro veículo" },
  shareTitle: "Compartilhar coleção",
  empty: "Esta coleção ainda não tem itens publicados",
  emptyText: "A redação está montando a seleção. Enquanto isso, explore outras coleções.",
  seeExplore: "Ver outras coleções",
  errorTitle: "Não conseguimos carregar esta coleção agora",
  errorText: "Pode ser uma instabilidade passageira. Tente de novo em instantes.",
  retry: "Tentar de novo",
  backExplore: "Voltar ao Explorar",
  breadcrumb: "Você está em",
  home: "Início",
  explore: "Explorar",
} as const;
