/**
 * Textos do assistente "Nova fonte" (O04a) e do detalhe da fonte (O04), spec §7.1, §7.2, §7.8 e
 * §8 de docs/superpowers/specs/2026-09-27-painel-de-fontes.md. Mensagens das ações ficam em
 * `sources-admin.ts` (FS-T6); aqui só o que as telas mostram.
 */
import type { ConsumptionStrategy } from "@/lib/sources/types";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Estratégia de consumo como a redação lê ("RSS", "sitemap de notícias"). */
export const STRATEGY_TEXT: Record<ConsumptionStrategy, string> = {
  rss: "RSS",
  atom: "Atom",
  jsonfeed: "JSON Feed",
  sitemap_news: "sitemap de notícias",
  page_list: "lista de notícias da página",
  page_article: "leitura da página",
};

/** Resultado de cada tentativa da descoberta ("Como descobrimos"): já vem em texto, menos "ok". */
export const triedOutcome = (outcome: string): string =>
  outcome === "ok" ? "encontrado" : outcome;

export const WIZARD_TEXT = {
  back: "Fontes",
  title: "Nova fonte",
  description:
    "Cole o endereço da home, de uma seção ou do feed. O CityNews descobre como coletar, mostra uma prévia e sugere a configuração. Nada vai para o formulário da IA sem o seu clique.",
  steps: {
    label: "Etapas do cadastro",
    address: "Endereço",
    analysis: "Análise",
    review: "Revisão",
    terms: "Termos",
    save: "Salvar",
    current: "etapa atual",
    done: "concluída",
  },
  address: {
    label: "Endereço da fonte",
    hint: "Exemplo: https://www.exemplo.com.br/cidades",
    analyze: "Analisar",
    analyzing: "Analisando…",
    again: "Analisar de novo",
  },
  progress: {
    title: "Análise",
    robots: "Lendo robots.txt…",
    robotsOk: "Lendo robots.txt… ok",
    robotsBlocked: "Lendo robots.txt… não permite",
    robotsDelay: (s: number) => `Lendo robots.txt… ok, intervalo pedido de ${s} s`,
    feed: "Procurando feed…",
    feedFound: (strategy: string, path: string) =>
      `Procurando feed… encontrado ${strategy} em ${path}`,
    feedPage: (strategy: string) => `Procurando feed… nenhum feed; usando ${strategy}`,
    testing: "Testando…",
    tested: (n: number) => `Testando… ${n} ${plural(n, "item", "itens")}`,
    dropped: (n: number) =>
      `${n} ${plural(n, "item descartado", "itens descartados")} por conter instruções`,
    failed: "Análise interrompida.",
  },
  duplicate: {
    open: (name: string) => `Abrir ${name}`,
    restore: "Abrir e restaurar",
  },
  howFound: {
    title: "Como descobrimos",
    empty: "Nenhuma tentativa registrada.",
  },
  preview: {
    title: "Prévia dos últimos itens",
    hint: "Só título, data e link. O CityNews nunca copia o texto da matéria.",
    noDate: "sem data",
    empty: "Nenhum item com título e link na prévia.",
    opensNewTab: "(abre o site do veículo em nova aba)",
  },
  ai: {
    title: "Sugestões da IA",
    disabled: "A IA está desligada agora. Preencha os campos manualmente.",
    insufficient: "Poucos itens para a IA sugerir com segurança. Preencha os campos manualmente.",
    qualityTitle: "Alertas de qualidade",
    noQuality: "Nenhum alerta de qualidade.",
    rationale: "Por que a IA sugeriu isto",
    selectorsOk: "Seletores da IA validados: extraem ao menos 3 itens do mesmo site.",
  },
  quality: {
    caca_clique: "Caça-clique",
    agregador: "Agrega conteúdo de terceiros",
    paywall: "Paywall",
    baixa_relevancia_local: "Pouca relevância local",
    patrocinado: "Conteúdo patrocinado",
    sem_data: "Itens sem data",
  } as Record<string, string>,
  review: {
    title: "Revisão",
    hint: "Políticas começam no padrão mais restrito: só link, nenhuma imagem, sem fonte única.",
    identification: "Identificação",
    classification: "Classificação",
    rights: "Direitos",
    collection: "Coleta",
    importance: "Importância",
  },
  terms: {
    title: "Termos e robots.txt",
    found: "Termos de uso encontrados no site:",
    none: "Não encontramos link de termos de uso. Cole o endereço, se houver.",
    robotsOk: "O robots.txt permite a coleta deste endereço.",
    checkbox: "Li os termos de uso e a coleta é permitida",
    checkboxHint: "Opcional: registra quando os termos foram revisados.",
  },
  save: {
    title: "Salvar",
    paused: "Salvar pausada",
    activate: "Salvar e ativar",
    saving: "Salvando…",
    hint: "Salve pausada ou ative já. Para ativar, o teste de conexão precisa passar.",
  },
} as const;

/** Rótulos dos campos da configuração (§7.2), usados no assistente e na aba Configuração. */
export const FIELD_TEXT = {
  name: "Nome",
  displayName: "Nome exibido",
  displayNameHint: "Até 60 caracteres. Vazio = usa o nome.",
  slug: "Slug",
  slugReadOnly: "O slug não muda depois que a fonte é criada.",
  logo: "Logotipo",
  logoHint: "PNG ou WebP quadrado, de 96 px a 200 KB.",
  logoSend: "Enviar logotipo",
  logoNone: "Sem logotipo.",
  owner: "Responsável",
  ownerNone: "Sem responsável definido.",
  layer: "Camada",
  layerNone: "Sem camada",
  categories: "Editorias",
  categoriesHint: (list: string) => `Separe por vírgula. Disponíveis: ${list}.`,
  locality: "Localidade",
  reliability: "Confiabilidade",
  imagePolicy: "Política de imagem",
  republishPolicy: "Política de republicação",
  maySoleSource: "Pode ser fonte única",
  trusted: "Fonte confiável",
  trustedHint:
    "Publica direto, sem espera, sempre com a fonte citada. Fonte não confiável com assunto grave e sem segunda fonte vai para aprovação.",
  agreementUntil: "Acordo válido até",
  agreementNote: "Nota do acordo",
  termsUrl: "Endereço dos termos de uso",
  termsReviewed: (when: string) => `Termos revisados em ${when}.`,
  termsNotReviewed: "Termos ainda não revisados.",
  termsMarkReviewed: "Marcar termos como revisados agora",
  strategy: "Estratégia de coleta",
  feedUrl: "Endereço do feed ou da página",
  pageSelectors: "Seletores da página (JSON)",
  pageSelectorsHint: 'Exemplo: {"item":"article.card","link":"a","title":"h2","date":"time"}',
  rateLimit: "Limite de requisições por hora",
  rateLimitHint: "De 1 a 120. Cada coleta faz até 2 requisições (robots.txt e feed ou página).",
  termsMinInterval: "Intervalo mínimo exigido pelos termos (min)",
  termsMinIntervalHint: "Deixe vazio se os termos não pedem intervalo.",
  score: "Score editorial",
  scoreHint:
    "Ordena a coleta e o destaque no Panorama. Score 1 tira a fonte do Panorama. Não muda a confiança das matérias.",
  priority: "Prioridade",
  critical: "Mudança crítica",
  criticalStatic:
    "Afrouxar é mudança crítica: admin ou editor-chefe aplica na hora e fica registrado no histórico; restringir aplica na hora.",
  restrictNow: "Restringir aplica na hora.",
  justification: "Justificativa da mudança crítica",
  justificationHint:
    "Fica no histórico da aprovação. Explique o motivo e a referência do acordo, se houver.",
  reason: "Motivo da alteração (opcional, vai para a auditoria)",
  save: "Salvar alterações",
  saving: "Salvando…",
  suggestion: {
    ia: "Sugestão da IA",
    regra: "Sugestão automática",
    use: (origin: "ia" | "regra", label: string) =>
      origin === "ia"
        ? `Usar sugestão da IA para ${label}`
        : `Usar sugestão automática para ${label}`,
    button: "Usar sugestão",
    confidence: (p: number) => `confiança ${p}%`,
    applied: "Sugestão aplicada",
    value: (v: string) => `Sugerido: ${v}`,
    empty: "nenhuma",
  },
} as const;

/** Campo Frequência (§7.2, §7.8). */
export const FREQUENCY_FIELD_TEXT = {
  label: "Frequência de coleta",
  defaultOption: (label: string) => `Padrão (${label})`,
  fastGroup: "Via rápida",
  normalGroup: "Ciclo normal",
  help: "Abaixo de 30 min a fonte entra na via rápida: coleta a cada 10 min, processamento no ciclo normal.",
  inactive: "Ative a fonte antes de colocá-la na via rápida.",
  full: (used: number, max: number) =>
    `A via rápida está cheia: ${used} de ${max} fontes. Tire outra fonte da via rápida ou peça para aumentar o limite.`,
  newSource: "Fonte nova nasce no ciclo normal. A via rápida fica disponível depois de ativar.",
  effective: (label: string, why: "robots" | "terms") =>
    why === "robots"
      ? `Frequência efetiva: ${label}. O robots.txt pede intervalo maior.`
      : `Frequência efetiva: ${label}. Os termos de uso pedem intervalo maior.`,
  fastButSlowed: (label: string, why: "robots" | "terms") =>
    `Na via rápida, mas coletada a cada ${label} por causa ${why === "robots" ? "do robots.txt" : "dos termos de uso"}.`,
  next: (time: string) => `Próxima coleta prevista: ${time}`,
  noNext: "Próxima coleta prevista: só com a fonte ativa.",
  grid15: "Coletas alinhadas à grade de 15 min: intervalos de 10 e 20 min, média de 15.",
  rateWarning: (n: number) =>
    `Com limite de ${n} requisições por hora, parte das coletas será pulada.`,
  lane: (used: number, max: number) => `Via rápida: ${used} de ${max} vagas em uso.`,
} as const;

export const DETAIL_TEXT = {
  back: "Fontes",
  openSite: (domain: string) => `${domain} (abre em nova aba)`,
  status: {
    pendingActivation: "Pausada · aguardando ativação",
    manual: (when: string, who: string | null) =>
      who ? `Pausada em ${when} por ${who}` : `Pausada em ${when}`,
    manualNoDate: "Pausada por uma pessoa",
    auto: (when: string) => `Pausada automaticamente em ${when} após 3 falhas`,
    robots: "Pausada · o robots.txt não permite a coleta",
    active: "Ativa",
    degraded: (n: number) =>
      `Com falhas · ${n} ${plural(n, "falha seguida", "falhas seguidas")}. Na 3ª a fonte é pausada automaticamente.`,
    blocked: (reason: string) => `Bloqueada · ${reason}`,
    archived: (when: string, reason: string | null) =>
      reason ? `Arquivada em ${when} · ${reason}` : `Arquivada em ${when}`,
  },
  archivedNotice:
    "Fonte arquivada: fica em modo leitura, fora da coleta, do portal e das recomendações. Itens e matérias continuam íntegros.",
  sectionNav: "Seções da fonte",
  sections: {
    summary: "Resumo e saúde",
    config: "Configuração",
    collection: "Coleta e teste",
    recommendation: "Recomendação",
    history: "Histórico",
    items: "Itens",
  },
  actions: {
    collectNow: "Coletar agora",
    pause: "Pausar",
    resume: "Retomar",
    activate: "Ativar",
    block: "Bloquear",
    blockAgain: "Bloquear de novo (Pedido do veículo)",
    unblock: "Desbloquear",
    archive: "Excluir fonte",
    restore: "Restaurar fonte",
    reload: "Recarregar",
    working: "Aguarde…",
  },
  unblock: {
    title: "Desbloquear fonte",
    body: "Desbloquear devolve a fonte para pausada. Admin ou editor-chefe desbloqueia na hora; os outros papéis deixam o pedido aguardando aprovação. Fica registrado no histórico.",
    justification: "Justificativa",
    confirm: "Desbloquear",
    cancel: "Cancelar",
  },
  pending: {
    title: (n: number) => `${n} ${plural(n, "alteração aguarda", "alterações aguardam")} aprovação`,
    line: (field: string, value: string, who: string) =>
      `Aguardando aprovação: ${field} → ${value}, pedido por ${who}`,
    someone: "alguém da equipe",
    review: "Revisar",
  },
  actionsLabel: "Ações da fonte",
  actionsHint: "As ações valem na hora e ficam na auditoria.",
  /** Mensagem logo depois do cadastro (`?cadastro=`). */
  created: {
    pausada: "Fonte salva pausada. Ative quando os termos estiverem revisados e o teste passar.",
    ativa: "Fonte salva e ativada.",
    "nao-ativada":
      "Fonte salva pausada. Não foi possível ativar agora: confira os termos e o teste de conexão.",
  } as Record<string, string>,
  scoreBy: (who: string) => `definido por ${who}`,
  notFound: {
    title: "Fonte não encontrada",
    body: "O endereço pode estar errado ou a fonte foi removida do painel.",
    back: "Voltar para Fontes",
  },
  error: {
    title: "Não foi possível carregar esta fonte.",
    tab: "Não foi possível carregar esta seção. As outras seções continuam disponíveis.",
    retry: "Tentar de novo",
  },
  loading: "Carregando a fonte",
} as const;

export const HEALTH_PANEL_TEXT = {
  editorialScore: "Score editorial",
  operational: "Saúde (calculada)",
  frequency: "Frequência",
  itemsToday: "Itens novos hoje",
  noData: "Sem dados",
  components: "Componentes da saúde",
  availability: "Disponibilidade em 30 dias",
  errorRate: "Taxa de erro em 24 h",
  freshness: "Frescor",
  freshnessText: {
    em_dia: "Em dia",
    atrasada: "Atrasada",
    parada: "Parada",
    sem_itens: "Sem itens ainda",
  } as Record<string, string>,
  lastFetch: "Última coleta",
  nextFetch: "Próxima coleta",
  never: "Nunca",
  noNext: "Sem coleta prevista",
  lastError: "Último erro",
  noError: "Nenhum erro registrado.",
  failuresAlert: (n: number) =>
    `${n} ${plural(n, "falha seguida", "falhas seguidas")}. Na 3ª falha a fonte é pausada automaticamente.`,
  chartTitle: "Coletas nos últimos 30 dias",
  chartLegendOk: "Coletas ok (inclui sem novidade)",
  chartLegendFailed: "Coletas com falha",
  chartSummary: (ok: number, failed: number, items: number, worst: string | null) =>
    `Nos últimos 30 dias: ${ok} ${plural(ok, "coleta ok", "coletas ok")}, ${failed} ${plural(failed, "com falha", "com falha")} e ${items} ${plural(items, "item novo", "itens novos")}.${worst ? ` Dia com mais falhas: ${worst}.` : ""}`,
  chartEmpty: "Nenhuma coleta registrada nos últimos 30 dias.",
  itemsPerDay: "Itens novos por dia",
  percent: (n: number) => `${Math.round(n * 100)}%`,
} as const;

export const COLLECTION_TAB_TEXT = {
  strategyTitle: "Como coletamos",
  strategy: "Estratégia",
  address: "Endereço coletado",
  lane: "Via",
  laneFast: "Via rápida",
  laneNormal: "Ciclo normal",
  effective: "Frequência efetiva",
  conditional: "Requisição condicional",
  conditionalYes: (etag: boolean, lm: boolean) =>
    `A fonte informa ${[etag ? "ETag" : null, lm ? "Last-Modified" : null].filter(Boolean).join(" e ")}: coletas sem novidade não baixam o feed de novo.`,
  conditionalNo:
    "Esta fonte não informa ETag nem Last-Modified: cada coleta rápida baixa o feed inteiro.",
  conditionalUnknown: "Ainda sem coleta: suporte a ETag e Last-Modified desconhecido.",
  howFound: "Como descobrimos",
  howFoundAuto: (at: string, tried: number) =>
    `Descoberta automática em ${at}, ${tried} ${plural(tried, "tentativa", "tentativas")}.`,
  howFoundNone: "Cadastrada sem análise por link.",
  test: "Testar conexão",
  testing: "Testando…",
  collectNow: "Coletar agora",
  reanalyze: "Reanalisar link",
  runsTitle: "Últimas coletas desta fonte",
  runsEmpty: "Nenhuma coleta registrada ainda.",
  runs: {
    when: "Quando",
    type: "Tipo",
    result: "Resultado",
    run: "Run",
  },
  trigger: { cron: "Ciclo", fast: "Via rápida", manual: "Manual" } as Record<string, string>,
  outcome: {
    ok: "Ok",
    success: "Ok",
    not_modified: "Ok · sem novidade (304)",
    failed: "Falhou",
    error: "Falhou",
    already_fetched: "Pulada · já coletada nesta janela",
    pending: "Na fila",
    rate_limited: "Pulada · limite por hora",
    previous_pending: "Pulada · coleta anterior na fila",
    fast_lane_full: "Pulada · via rápida cheia",
    robots: "Pulada · robots.txt",
  } as Record<string, string>,
} as const;

export const REC_TAB_TEXT = {
  title: "Recomendação",
  explanation: "Fixar conta no teto de 25% por fonte.",
  rulesLink: "Ver regras de recomendação",
  displayed: "Como aparece para quem lê",
  displayedName: "Nome exibido",
  displayedLogo: "Logotipo",
  editInConfig: "Nome e logotipo mudam na aba Configuração.",
  pinned: "Fixar nas recomendações",
  pinnedHint: "Aparece entre as primeiras, dentro do teto de 25% por fonte.",
  localHighlight: "Destacar como fonte local",
  localHighlightHint: "Ganha o selo de fonte local nas listas de recomendação.",
  excluded: "Excluir da recomendação",
  excludedHint: "Não entra em nenhuma lista de recomendação. Continua no Panorama.",
  previewTitle: "Prévia do cartão",
  previewReason: "Recomendada para quem acompanha a cidade",
  save: "Salvar recomendação",
  saving: "Salvando…",
} as const;

export const HISTORY_TAB_TEXT = {
  title: "Histórico",
  filter: "Tipo de alteração",
  filterAll: "Todas",
  apply: "Filtrar",
  export: "Exportar CSV",
  empty: "Nenhuma alteração registrada.",
  emptyFiltered: "Nenhuma alteração deste tipo.",
  columns: {
    when: "Quando",
    who: "Quem",
    what: "O quê",
    change: "Antes → depois",
    reason: "Motivo",
    approval: "Aprovação",
    ip: "IP (hash)",
  },
  noChange: "—",
  empty_value: "vazio",
  csvName: (slug: string) => `historico-${slug}.csv`,
  ipMasked: "IP mascarado para quem não é admin.",
  approvalRef: (id: string) => `pedido ${id.slice(0, 8)}`,
  page: (page: number, total: number) => `Página ${page} de ${total}`,
  prev: "Página anterior",
  next: "Próxima página",
  actions: {
    "source.create": "Cadastro",
    "source.update": "Alteração",
    "source.status": "Status",
    "source.archive": "Arquivamento",
    "source.restore": "Restauração",
    "source.collect_now": "Coletar agora",
    "source.test": "Teste de conexão",
    "source.analyze": "Análise por link",
    "source.approval_requested": "Pedido de aprovação",
    "source.approval_applied": "Aprovação aplicada",
    "source.approval_rejected": "Pedido recusado",
    "source.takedown_failed": "Remoção de reproduções falhou",
  } as Record<string, string>,
} as const;

export const ITEMS_TAB_TEXT = {
  title: "Últimos itens coletados",
  empty: "Nenhum item coletado desta fonte ainda.",
  columns: { title: "Título", date: "Publicado", state: "Estado", topic: "Assunto" },
  noDate: "sem data",
  state: {
    duplicate: "Duplicado",
    quarantined: "Em quarentena",
    in_topic: "Em assunto",
    collected: "Coletado",
  } as Record<string, string>,
  topic: "Ver assunto",
  noTopic: "—",
  collected: (when: string) => `coletado em ${when}`,
} as const;

export const LOGO_TEXT = {
  title: "Logotipo",
  current: (name: string) => `Logotipo atual de ${name}`,
  none: "Sem logotipo.",
  file: "Arquivo do logotipo",
  hint: "PNG ou WebP quadrado, de 96 px a 200 KB.",
  send: "Enviar logotipo",
  sending: "Enviando…",
  remove: "Remover logotipo",
  removing: "Removendo…",
  discover: "Buscar logo",
  discovering: "Buscando…",
  discoverHint:
    "Procura no site oficial da fonte (ícone do site, manifest e perfis oficiais). Um logotipo enviado por você nunca é trocado.",
} as const;

export const DIALOG_TEXT = {
  cancel: "Cancelar",
  archive: {
    title: (name: string) => `Excluir ${name}?`,
    body: "A fonte é arquivada: sai da coleta, do portal e das recomendações, e fica no filtro Arquivadas. Itens coletados e matérias que a citam continuam íntegros. Dá para restaurar depois.",
    reason: "Motivo",
    confirmLabel: (name: string) => `Digite ${name} para confirmar`,
    confirm: "Excluir fonte",
    mismatch: "O nome digitado não confere.",
    needsPause: "Para excluir, pause ou bloqueie a fonte antes.",
  },
  block: {
    title: (name: string) => `Bloquear ${name}?`,
    body: "A fonte para de ser coletada e seus agregados somem do portal na hora.",
    reasonLegend: "Motivo do bloqueio",
    reasons: {
      opt_out: "Pedido do veículo",
      legal: "Jurídico",
      quality: "Qualidade",
      other: "Outro",
    },
    optOutNote:
      "Pedido do veículo também muda a política de imagem para nenhuma e remove todas as reproduções da fonte (prazo de 24 h).",
    retryNote:
      "A fonte já está bloqueada. Bloquear de novo com Pedido do veículo repete a remoção das reproduções.",
    details: "Detalhes (opcional)",
    confirm: "Bloquear",
    reasonRequired: "Escolha o motivo.",
  },
  approve: {
    title: "Aprovar mudança crítica",
    change: "Mudança",
    requestedBy: "Pedido por",
    justification: "Justificativa do pedido",
    approve: "Aprovar e aplicar",
    reject: "Recusar",
    rejectReason: "Motivo da recusa",
    confirmReject: "Confirmar recusa",
    rejectRequired: "Informe o motivo da recusa.",
  },
} as const;
