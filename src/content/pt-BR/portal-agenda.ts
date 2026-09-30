/*
 * Textos do portal público (P1), parte "agenda". `portal.ts` reexporta tudo; os componentes do
 * navegador importam daqui para levar só o que usam (B-018).
 */

/** Sugerir evento (P11). */
export const SUGGEST = {
  metaTitle: "Sugerir um evento · Agenda · CityNews Cuiabá",
  title: "Sugerir um evento",
  intro:
    "Não precisa de conta. A equipe de Agenda confere cada sugestão com a organização antes de publicar.",
  required: "obrigatório",
  optional: "opcional",
  fields: {
    title: "Nome do evento",
    startsAt: "Data e hora de início",
    endsAt: "Data e hora de fim",
    venue: "Local",
    neighborhood: "Bairro",
    free: "Entrada gratuita",
    price: "Preço (R$)",
    ageRating: "Faixa etária",
    link: "Link oficial",
    description: "Descrição",
    email: "E-mail do responsável",
    consent:
      "Autorizo o CityNews a usar estas informações na Agenda e a entrar em contato por este e-mail.",
  },
  hints: {
    startsAt: "Horário de Cuiabá.",
    venue: "Exemplo: Sesc Arsenal, rua 13 de Junho.",
    price: "Deixe em branco se a entrada for gratuita. Exemplo: 30,00",
    description: "Até 500 caracteres.",
    email: "Usado só para confirmar a sugestão; não aparece no site.",
  },
  placeholders: {
    title: "Feira de discos no Sesc Arsenal",
    venue: "Sesc Arsenal",
    price: "30,00",
    link: "https://",
    email: "voce@exemplo.com",
  },
  ages: {
    livre: "Livre",
    "10": "10 anos",
    "12": "12 anos",
    "14": "14 anos",
    "16": "16 anos",
    "18": "18 anos",
  },
  otherNeighborhood: "Outro ou não sei",
  errors: {
    title: "Informe o nome do evento, com 3 a 120 caracteres. Exemplo: Feira de discos",
    startsAt: "Informe a data de início. Exemplo: 10/10/2026, 19:00",
    startsPast: "A data de início já passou. Exemplo: 10/10/2026, 19:00",
    endsAt: "O fim precisa ser depois do início. Exemplo: 10/10/2026, 23:00",
    venue: "Informe o local. Exemplo: Sesc Arsenal",
    price: "Informe o preço em reais ou marque entrada gratuita. Exemplo: 30,00",
    link: "Use um link que comece com https://. Exemplo: https://site.com/evento",
    description: "A descrição pode ter até 500 caracteres.",
    email: "Informe um e-mail válido. Exemplo: ana@exemplo.com",
    consent: "Marque a autorização para enviar a sugestão.",
  },
  summary: (n: number) =>
    n === 1 ? "Confira 1 campo destacado abaixo." : `Confira os ${n} campos destacados abaixo.`,
  submit: "Enviar sugestão",
  sending: "Enviando…",
  success: "Sugestão recebida. A equipe de Agenda revisa em até 48 h e avisa por e-mail.",
  another: "Sugerir outro evento",
  backAgenda: "Voltar para a agenda",
  rateLimited:
    "Você atingiu o limite de 5 envios por hora a partir desta conexão. Tente de novo mais tarde.",
  error:
    "Não conseguimos registrar agora. Tente de novo em alguns minutos; seus dados continuam no formulário.",
  honeypotLabel: "Não preencha este campo",
} as const;

/** Agenda (P09) e evento (P10). */
export const AGENDA = {
  metaTitle: "Agenda · CityNews Cuiabá",
  metaDescription:
    "O que fazer em Cuiabá e Várzea Grande: eventos gratuitos e pagos, com local, horário e acessibilidade.",
  eyebrow: "Agenda",
  title: "O que fazer em Cuiabá",
  intro:
    "Eventos confirmados pela organização ou por fonte oficial. Sugestões de leitores passam pela redação.",
  suggest: "Sugerir um evento",
  view: "Visualização",
  list: "Lista",
  calendar: "Calendário",
  filters: "Filtros da agenda",
  when: "Quando",
  whens: {
    today: "Hoje",
    weekend: "Fim de semana",
    "7d": "Próximos 7 dias",
    "30d": "Próximos 30 dias",
  },
  category: "Categoria",
  allCategories: "Todas as categorias",
  categories: {
    cultura: "Cultura",
    musica: "Música",
    teatro: "Teatro",
    cinema: "Cinema",
    esporte: "Esporte",
    feira: "Feira",
    gastronomia: "Gastronomia",
    infantil: "Infantil",
  } as Record<string, string>,
  neighborhood: "Bairro",
  allNeighborhoods: "Todos os bairros",
  origin: "Origem do evento",
  allOrigins: "Todas as origens",
  origins: {
    official: "Oficial",
    organizer: "Organização",
    reader: "Sugerido por leitor (aprovado)",
  },
  freeOnly: "Só gratuitos",
  kidsOnly: "Para crianças",
  apply: "Aplicar filtros",
  clear: "Limpar filtros",
  day: (date: string) => `Eventos de ${date}`,
  seeAllDates: "Ver todas as datas",
  results: (n: number) => (n === 1 ? "1 evento" : `${n} eventos`),
  free: "Gratuito",
  price: (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
  age: (a: string) => (a === "livre" ? "Classificação livre" : `A partir de ${a} anos`),
  emptyTitle: (parts: {
    free: boolean;
    kids: boolean;
    category?: string;
    where?: string;
    period: string;
  }) =>
    [
      "Nenhum evento",
      parts.category ? `de ${parts.category.toLowerCase()}` : "",
      parts.free ? "gratuito" : "",
      parts.kids ? "para crianças" : "",
      parts.where ?? "",
      parts.period,
    ]
      .filter(Boolean)
      .join(" "),
  periodPhrase: {
    today: "hoje",
    weekend: "neste fim de semana",
    "7d": "nos próximos 7 dias",
    "30d": "nos próximos 30 dias",
  },
  onDay: (date: string) => `em ${date}`,
  inMonth: "neste mês",
  emptyText: "A agenda recebe novos eventos todos os dias. Amplie o período ou sugira um evento.",
  widen30: "Ver próximos 30 dias",
  clearAll: "Ver todos os eventos",
  errorTitle: "Não conseguimos carregar a agenda agora",
  errorText: "Pode ser uma instabilidade passageira. Seus filtros continuam no endereço da página.",
  retry: "Tentar de novo",
  loading: "Carregando eventos",
  prevMonth: "Mês anterior",
  nextMonth: "Próximo mês",
  weekdays: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  weekdaysLong: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
  dayEvents: (n: number) => (n === 1 ? "1 evento" : `${n} eventos`),
  dayLink: (date: string, n: number) => `${date}: ${n === 1 ? "1 evento" : `${n} eventos`}`,
  noEventsDay: "sem eventos",
  // Evento (P10)
  when2: "Data e hora",
  where: "Local",
  directions: "Como chegar",
  newTab: "abre em nova aba",
  priceLabel: "Preço",
  ageLabel: "Classificação",
  accessibility: "Acessibilidade",
  description: "Sobre o evento",
  originLabel: "Origem da informação",
  confirmed: (date: string) => `Informações confirmadas pela organização em ${date}.`,
  addToCalendar: "Adicionar ao calendário",
  ics: "Baixar arquivo .ics",
  google: "Google Agenda",
  related: "Mais eventos de",
  eventError: "Não conseguimos carregar este evento agora",
  backAgenda: "Voltar para a agenda",
  until: (hour: string) => `até ${hour}`,
  nextDay: "do dia seguinte",
} as const;
