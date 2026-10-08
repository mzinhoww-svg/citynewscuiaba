/**
 * Textos das fontes de eventos no Painel de Fontes (AGM-T6, spec 2026-10-08 §5.1): filtro e
 * colunas da lista, cadastro, prévia do teste de conexão, ativação, abas Coleta e Recusas.
 * Rótulos da coleta da Agenda (tipo de extração, motivos de recusa) ficam em `studio-agenda.ts`.
 */
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const EVENT_LIST_TEXT = {
  filters: {
    type: "Tipo",
    typeAll: "Todos os tipos",
    news: "Notícias",
    events: "Eventos",
  },
  columns: {
    confirms: "Confirma fatos",
    eventsLive: "Eventos no ar",
  },
  yes: "Sim",
  no: "Não",
  eventsLive: (n: number) =>
    n === 0 ? "Nenhum" : `${n} ${plural(n, "evento no ar", "eventos no ar")}`,
  typeTag: "Fonte de eventos",
  addEventSource: "Adicionar fonte de eventos",
} as const;

export const EVENT_FORM_TEXT = {
  title: "Nova fonte de eventos",
  description:
    "Cole o endereço da agenda da casa, do organizador ou do órgão público. O CityNews tenta ler os eventos por dados estruturados (JSON-LD), iCal, RSS e API de eventos antes de sugerir a leitura da página com IA. A fonte nasce pausada: teste a conexão e confira a prévia antes de ativar.",
  newsLink: "Cadastrar fonte de notícias",
  eventsLink: "É uma agenda de eventos? Cadastrar fonte de eventos",
  analyze: {
    label: "Endereço da agenda",
    hint: "Home, página de programação ou endereço da API de eventos.",
    submit: "Analisar",
    working: "Analisando…",
    done: (kind: string) => `Sugestão: ${kind}. Confira os campos e salve.`,
  },
  fields: {
    name: "Nome",
    slug: "Slug",
    slugHint: "Deixe em branco para gerar a partir do nome.",
    baseUrl: "Endereço da coleta",
    baseUrlHint: "Para a API de eventos, o endereço termina em /wp-json/tribe/events/v1/events.",
    extractKind: "Como os eventos são lidos",
    eventOrigin: "Origem",
    confirms: "Confirma fatos",
    confirmsHint:
      "Marque para casas e organizadores: um evento listado por eles confirma o mesmo evento achado em outra fonte.",
    collectorNotes: "Avisos para o coletor",
    collectorNotesHint:
      "Um por linha, até 10. Vão para a leitura como dado sobre o site, nunca como instrução.",
    listUrls: "Endereços de listagem extras",
    listUrlsHint: "Um por linha, até 10. Lidos depois do endereço da coleta.",
    requireCity: "Exigir Cuiabá ou Várzea Grande no evento",
    requireCityHint: "Para listas amplas, como plataformas de ingresso.",
    defaultVenue: "Local padrão",
    defaultVenueHint: "Quando o evento não diz o local (agenda de um espaço só).",
    defaultNeighborhood: "Bairro padrão",
    defaultCategory: "Categoria padrão",
    defaultCategoryNone: "Deduzir do evento",
    termsReviewed: "Li os termos de uso e a coleta é permitida",
  },
  submitCreate: "Salvar fonte de eventos",
  submitUpdate: "Salvar configuração",
  saving: "Salvando…",
  configTitle: "Coleta de eventos",
} as const;

export const EVENT_PREVIEW_TEXT = {
  title: "Prévia da coleta",
  intro:
    "Até 5 eventos lidos agora, com o trecho da página que sustenta cada campo. Nada foi gravado.",
  summary: (found: number, approved: number, aiPages: number) =>
    `${found} ${plural(found, "encontrado", "encontrados")} · ${approved} ${plural(approved, "aprovado", "aprovados")} · ${aiPages} ${plural(aiPages, "chamada", "chamadas")} à IA`,
  eventsTitle: "Eventos aprovados",
  empty: "Nenhum evento aprovado nesta prévia.",
  rejectedTitle: "Recusados nesta prévia",
  rejectedEmpty: "Nenhum evento recusado.",
  when: "Quando",
  where: "Local",
  open: "Abrir a página do evento",
  evidence: "Trechos da página",
  noEvidence: "Sem trechos: dado estruturado da fonte.",
  quote: (text: string) => `“${text}”`,
  status: "Situação da fonte",
} as const;

export const EVENT_ACTION_TEXT = {
  previewDone: (approved: number, rejected: number) =>
    `Prévia pronta: ${approved} ${plural(approved, "evento aprovado", "eventos aprovados")}, ${rejected} ${plural(rejected, "recusado", "recusados")}.`,
  previewFailed: "Não foi possível montar a prévia agora. Tente de novo em instantes.",
  problem: {
    robots: "O robots.txt do site não permite a coleta: a fonte não pode ser ativada.",
    unavailable: "A fonte não respondeu: a fonte não pode ser ativada agora.",
    error: "A leitura da fonte falhou: a fonte não pode ser ativada agora.",
    deferred:
      "A prévia não terminou (teto ou prazo da leitura): tente de novo antes de ativar a fonte.",
    no_events: "A prévia não trouxe nenhum evento aprovado: a fonte não pode ser ativada.",
  },
  collected: (created: number, updated: number, rejected: number) =>
    `Coleta concluída: ${created} ${plural(created, "novo", "novos")}, ${updated} ${plural(updated, "atualizado", "atualizados")}, ${rejected} ${plural(rejected, "recusado", "recusados")}.`,
  collectFailed: (status: string) => `A coleta não terminou: ${status}.`,
  collectRateLimited:
    "Aguarde: cada pessoa pode coletar fontes de eventos agora até 6 vezes por hora.",
  notEvents: "Esta ação é só para fontes de eventos.",
  created: "Fonte de eventos cadastrada, pausada. Teste a conexão para ver a prévia e ative.",
  analyzeNone: "Nenhum formato estruturado encontrado: sugerida a leitura da página com IA.",
} as const;

export const EVENT_TABS_TEXT = {
  rejections: "Recusas",
  collectionTitle: "Como coletamos os eventos",
  extractKind: "Leitura",
  address: "Endereço coletado",
  listUrls: "Listagens extras",
  noListUrls: "Nenhuma",
  origin: "Origem",
  confirms: "Confirma fatos",
  eventsLive: "Eventos no ar",
  lastFetched: "Última coleta",
  never: "Nunca",
  cadence: "A coleta da Agenda roda a cada 6 horas para todas as fontes ativas.",
  test: "Testar conexão",
  testing: "Montando a prévia…",
  collectNow: "Coletar agora",
  collecting: "Coletando…",
  runsTitle: "Últimas coletas de eventos desta fonte",
  runsEmpty: "Nenhuma coleta registrada ainda.",
  runs: {
    when: "Quando",
    type: "Tipo",
    status: "Situação",
    found: "Encontrados",
    approved: "Aprovados",
    rejected: "Recusados",
    created: "Novos",
    updated: "Atualizados",
    aiPages: "Chamadas à IA",
  },
  trigger: { cron: "Ciclo", manual: "Manual" } as Record<string, string>,
  unknownStatus: "Sem registro",
  rejectionsTitle: "Eventos recusados",
  rejectionsIntro:
    "Páginas recusadas nas últimas 10 coletas desta fonte, com o motivo. A prévia do teste de conexão não entra aqui.",
  rejectionsEmpty: "Nenhuma recusa nas últimas coletas.",
  rejectionsCols: { page: "Página", reason: "Motivo", when: "Última vez" },
} as const;
