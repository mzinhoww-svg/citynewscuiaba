/** Pergunte ao CityNews (Perguntar ao CityNews, docs/screens.md P13; spec §5.5). */
export const ASK = {
  title: "Pergunte ao CityNews",
  metaDescription:
    "Faça uma pergunta sobre Cuiabá e receba uma resposta curta com as fontes de cada frase.",
  documentTitle: (q: string) =>
    q ? `Pergunte: ${q} · CityNews Cuiabá` : "Pergunte ao CityNews · CityNews Cuiabá",
  intro:
    "Respostas curtas, só com fontes: cada frase mostra de onde veio. Sem pelo menos duas fontes independentes, o CityNews não responde. Não precisa de conta.",
  label: "Sua pergunta",
  placeholder: "Ex.: O que muda no plano de ônibus do CPA?",
  submit: "Perguntar",
  examplesTitle: "Experimente",
  examples: [
    "O que aconteceu em Cuiabá hoje?",
    "O que se sabe sobre o viaduto da Miguel Sutil?",
    "Como está a qualidade do ar em Cuiabá?",
    "O que muda no plano de ônibus do CPA?",
  ],
  conversation: "Conversa",
  youAsked: "Você perguntou",
  processingTitle: "Preparando a resposta",
  processingSteps: [
    "Procurando fontes no CityNews e em outros veículos",
    "Conferindo se há ao menos 2 fontes independentes",
    "Escrevendo a resposta com a fonte de cada frase",
  ],
  aiGenerated: "Resposta do CityNews",
  asOf: (hour: string) => `Consultado às ${hour}`,
  factsTitle: "O que as fontes confirmam",
  inferencesTitle: "Inferência",
  inferencesHint: "Conclusão a partir das fontes, não confirmada por elas.",
  gapsTitle: "O que ainda não se sabe",
  conflictsTitle: "Onde as fontes divergem",
  disclaimer: "Pode conter erros. Confira nas fontes.",
  sourcesTitle: "Fontes consultadas",
  foundTitle: "O que encontramos",
  citedBy: (n: number) => `Fonte ${n}`,
  openSource: (name: string) => `Abrir em ${name}`,
  openArticle: "Ler no CityNews",
  newTab: "abre em nova aba",
  feedbackTitle: "Esta resposta ajudou?",
  yes: "Sim",
  no: "Não",
  thanks: "Obrigado pelo retorno.",
  report: "Reportar erro",
  refineTitle: "Continue por aqui",
  traditional: "Ver na busca tradicional",
  insufficientTitle: "Não encontramos fontes suficientes para responder",
  insufficientText: (n: number) =>
    n === 0
      ? "O Perguntar ao CityNews só responde com pelo menos 2 fontes independentes, e não achamos nenhuma sobre isso."
      : `O Perguntar ao CityNews só responde com pelo menos 2 fontes independentes. Encontramos ${n === 1 ? "1 fonte" : `${n} fontes`}, de um só veículo ou sem relação suficiente com a pergunta.`,
  suggestion: {
    traditional_search: "Ver na busca tradicional",
    widen_period: "Buscar em qualquer data",
    suggest_story: "Sugerir pauta à redação",
  },
  errorTitle: {
    timeout: "A resposta demorou demais",
    provider: "O serviço de respostas falhou agora",
    rate_limited: (limit: number) => `Você atingiu o limite de ${limit} perguntas por hora`,
    unavailable: "Assistente indisponível",
    off: "Assistente indisponível",
  },
  errorText: {
    timeout: "Tente de novo em instantes. Enquanto isso, a busca tradicional mostra o que há.",
    provider: "Tente de novo em instantes. Enquanto isso, a busca tradicional mostra o que há.",
    rate_limited: (hour: string) =>
      `O limite libera às ${hour}. A busca tradicional continua sem limite.`,
    unavailable: "Pode ser uma instabilidade passageira. A busca tradicional continua funcionando.",
    off: "A redação pausou o assistente. A busca tradicional continua funcionando.",
  },
  retry: "Tentar de novo",
  fallbackTitle: "Resultados da busca tradicional",
  fallbackAll: "Ver todos os resultados",
  fallbackEmpty: "A busca tradicional também não encontrou nada com essas palavras.",
} as const;
