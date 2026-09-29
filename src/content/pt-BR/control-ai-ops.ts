/** Textos de conhecimento, avaliações, custos e governança da IA (Control Center O09, O13, O14 e O16; P5-T6). */

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brlFine = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 4 });
const pct1 = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export const AI_OPS_TEXT = {
  errorTitle: "Não foi possível carregar esta tela",
  errorBody: "O banco não respondeu. Tente de novo em instantes.",
  retry: "Tentar de novo",
  notApplicable: "Não se aplica",
  brl,
  brlFine,
  pct1,

  // Conhecimento (O13)
  knowledgeTitle: "Bases de conhecimento",
  knowledgeIntro:
    "O que a IA do CityNews consulta e com quais instruções. Somente leitura: fontes se administram em Fontes e instruções em Agentes.",
  knowledgeLoading: "Carregando as bases de conhecimento",
  corpusTitle: "Acervo pesquisável",
  corpusCaption: "Volume do acervo e cobertura de busca semântica",
  colBase: "Base",
  colTotal: "Itens",
  colIndexed: "Com busca semântica",
  colCoverage: "Cobertura",
  corpusArticles: "Matérias publicadas do CityNews",
  corpusItems: "Itens coletados de outros veículos",
  corpusNote:
    "A busca com IA só usa estas bases. Sem duas fontes independentes relevantes, ela recusa e explica.",
  sourcesTitle: "Fontes que alimentam a IA",
  sourcesCaption: "Fontes ativas e o que a política de cada uma permite",
  sourcesEmptyTitle: "Nenhuma fonte ativa",
  sourcesEmptyBody: "Ative fontes em Fontes para a IA ter o que consultar.",
  colSource: "Fonte",
  colKind: "Tipo",
  colStatus: "Estado",
  colReliability: "Confiabilidade",
  colRepublish: "Reprodução do texto",
  colImage: "Imagem",
  sourcesManage: "Gerenciar fontes",
  promptsTitle: "Instruções em produção",
  promptsCaption: "Versão do prompt em produção de cada agente",
  colAgent: "Agente",
  colFunction: "Função",
  colPromptVersion: "Prompt em produção",
  noPrompt: "Sem prompt",
  promptVersion: (v: number) => `Versão ${v}`,
  promptsManage: "Ver versões",
  promptsManageNamed: (agent: string) => `Ver versões do prompt de ${agent}`,
  dataRule:
    "Todo texto coletado entra na IA como dado, dentro de delimitadores, depois de sanitizado. Nunca vira instrução.",

  // Avaliações (O14)
  evalTitle: "Avaliações e regressão",
  evalIntro:
    "Casos fixos rodados pelo mesmo caminho da produção. O PR que altera a IA falha se as métricas saírem dos limites.",
  evalLoading: "Carregando as avaliações",
  evalAgentNote:
    "Só o agente Busca com IA tem contrato de avaliação hoje: é o que tem regra de recusa e de citação.",
  casesTitle: "Casos de regressão",
  casesCaption: "Casos da regressão, com a expectativa de cada um",
  colCase: "Caso",
  colQuestion: "Pergunta",
  colSources: "Fontes",
  colExpected: "Esperado",
  expectAnswer: "Responder com fonte",
  expectRefuse: "Recusar (menos de 2 veículos)",
  sourcesCount: (n: number, v: number) =>
    `${n} ${n === 1 ? "fonte" : "fontes"} de ${v} ${v === 1 ? "veículo" : "veículos"}`,
  limitsTitle: "Limites de aceite",
  limitsList: (l: {
    minPrecision: number;
    maxHallucinationsPer100: number;
    maxUnsourced: number;
    minCoverage: number;
    maxRefusalsWrong: number;
  }) => [
    `Precisão de pelo menos ${pct1(l.minPrecision)}`,
    `No máximo ${l.maxHallucinationsPer100} alucinações a cada 100 fatos`,
    `${l.maxUnsourced} fatos sem fonte`,
    `Cobertura de pelo menos ${pct1(l.minCoverage)}`,
    `No máximo ${l.maxRefusalsWrong} recusa indevida (o caso de controle conta 1 por desenho)`,
  ],
  runTitle: "Executar a regressão",
  runVersion: "Versão do prompt",
  runVersionOption: (v: number, status: string) => `Versão ${v} (${status})`,
  runButton: "Executar com o provedor falso",
  runBusy: "Executando",
  runHint:
    "Usa o provedor falso: não gasta orçamento nem chama modelo real. Fica registrado com o seu nome.",
  runDenied: "Só admin, editor-chefe e operação de IA executam a regressão.",
  runFailed: "A regressão não pôde ser executada. Tente de novo.",
  runDone: (v: number) =>
    `Regressão executada sobre a versão ${v}. Resultado no topo do histórico.`,
  runUnknownAgent: "Este agente não tem contrato de avaliação.",
  runPromptMissing: "Versão de prompt não encontrada.",
  lastTitle: "Última execução",
  historyTitle: "Histórico de execuções",
  historyCaption: "Execuções da regressão, da mais recente para a mais antiga",
  historyEmptyTitle: "Nenhuma execução ainda",
  historyEmptyBody: "Execute a regressão para ver as métricas aqui.",
  colWhen: "Quando",
  colPrompt: "Prompt",
  colProvider: "Provedor",
  colPrecision: "Precisão",
  colCoverage2: "Cobertura",
  colUnsourced: "Sem fonte",
  colHalluc: "Alucinações por 100",
  colRefusalsOk: "Recusas corretas",
  colRefusalsBad: "Recusas indevidas",
  colP95: "p95",
  colVerdict: "Resultado",
  verdictPass: "Dentro dos limites",
  verdictFail: "Fora dos limites",
  providerName: { fake: "Falso", openrouter: "OpenRouter" } as Record<string, string>,
  ms: (n: number) => `${Math.round(n).toLocaleString("pt-BR")} ms`,
  metricLabels: {
    precision: "Precisão",
    coverage: "Cobertura",
    unsourced: "Fatos sem fonte",
    hallucinations: "Alucinações por 100 fatos",
    refusalsCorrect: "Recusas corretas",
    refusalsWrong: "Recusas indevidas",
    p95: "Latência p95",
  },

  // Custos (O09)
  costsTitle: "Custos e limites",
  costsIntro:
    "Gasto da IA em reais. Cada agente tem orçamento diário e o teto geral é do dia inteiro; a 100% a chamada é recusada até a meia-noite de Cuiabá.",
  costsLoading: "Carregando os custos",
  costsKpiToday: "Gasto de hoje",
  costsKpiGlobal: "Teto diário geral",
  costsKpiPct: "Do teto usado",
  alertsTitle: "Alertas de orçamento",
  alertsNone: "Nenhum orçamento perto do limite.",
  alertWarn: "Perto do limite",
  alertPaused: "Orçamento atingido, chamadas pausadas",
  alertLine: (who: string, level: string, pct: number) =>
    `${who}: ${level} (${pct}% do orçamento do dia)`,
  globalLabel: "Teto geral do dia",
  chartTitle: "Gasto por dia",
  chartLabel: (n: number) => `Gasto por dia nos últimos ${n} dias`,
  chartSummary: (parts: string) => `Gasto por dia: ${parts}.`,
  chartDay: (date: string, cost: number) =>
    `${date.slice(8, 10)}/${date.slice(5, 7)}: ${brl(cost)}`,
  byAgentTitle: "Por agente, hoje",
  byAgentCaption: "Gasto de hoje de cada agente contra o orçamento diário",
  colSpent: "Gasto hoje",
  colBudget: "Orçamento do dia",
  colUsed: "Usado",
  colState: "Situação",
  stateOk: "Dentro do orçamento",
  stateWarn: "Perto do limite",
  statePaused: "Atingido",
  byModelTitle: "Por modelo, no período",
  byModelCaption: "Gasto por modelo no período mostrado",
  colModel: "Modelo",
  colCost: "Gasto",
  byModelEmpty: "Nenhuma chamada no período.",
  budgetLimit:
    "Esta tela só mostra os orçamentos. A edição do orçamento por agente ainda não está no Estúdio: hoje Agentes só liga e desliga.",
  periodNote: (n: number) => `Período: últimos ${n} dias, dia de Cuiabá.`,

  // Governança (O16)
  govTitle: "Governança da IA",
  govIntro:
    "As regras que a IA cumpre e o que já existe para fazê-las valer. Somente leitura: as chaves de contingência ficam em Contingência.",
  govLoading: "Carregando a governança da IA",
  govProviderTitle: "Provedor em uso",
  govProviderFake: "Provedor falso (sem chamada a modelo real).",
  govProviderReal: "OpenRouter, com os modelos registrados no banco.",
  govPolicyTitle: "Política de IA",
  govPolicy: [
    {
      title: "IA nunca responde sem fonte",
      body: "Com menos de 2 fontes relevantes de veículos diferentes, a busca com IA recusa e explica. Fato, inferência e lacuna aparecem separados.",
    },
    {
      title: "Texto externo é dado, não instrução",
      body: "Todo conteúdo coletado é sanitizado e enviado ao modelo entre delimitadores de dados. Instrução embutida vai para quarentena.",
    },
    {
      title: "Agregado não é republicado",
      body: "Só título, data, resumo próprio de até 2 frases e link para o original.",
    },
    {
      title: "Publicação automática é regra",
      body: "Segurança e plantão nunca publicam sozinhos. Mudar prompt ou regra crítica exige aprovação de outra pessoa.",
    },
    {
      title: "Personalização só com consentimento",
      body: "Sem consentimento o peso individual é zero. Nunca se inferem saúde, religião, orientação política, raça ou renda.",
    },
    {
      title: "Imagem gerada tem limite",
      body: "Nunca é fotorrealista de pessoa real e nunca ilustra crime, tragédia ou saúde individual.",
    },
  ],
  govLabelsTitle: "Rótulos de origem",
  govLabelsCaption: "Rótulos de origem exibidos ao leitor e o que cada um significa",
  colLabel: "Rótulo",
  colMeaning: "O que significa",
  govFlagsTitle: "Chaves relacionadas à IA",
  govFlagsCaption: "Chaves de contingência ligadas à IA e ao seu estado atual",
  colFlag: "Chave",
  colFlagState: "Estado",
  flagOn: "Ligada",
  flagOff: "Desligada",
  flagMissing: "Não cadastrada",
  flagsNote:
    "Aqui só se lê. Ligar e desligar a IA inteira é a chave de contingência, com auditoria.",
  flagNames: {
    ai_enabled: {
      name: "IA ligada",
      body: "Corta toda chamada de IA. Desligada, a busca com IA fica indisponível e oferece a busca tradicional.",
    },
    personalization_enabled: {
      name: "Personalização",
      body: "Permite recomendações com o perfil de quem consentiu.",
    },
    image_reproduction_enabled: {
      name: "Reprodução de imagem",
      body: "Permite a política de reprodução de imagem de fontes, com rótulo REPRODUÇÃO.",
    },
    source_link_analysis: {
      name: "Análise de link de fonte",
      body: "Permite que o perfil de fonte analise um link colado no painel de fontes.",
    },
  } as Record<string, { name: string; body: string }>,
  govControlsTitle: "Controles que valem hoje",
  govControls: [
    { label: "Aprovação dupla para publicar prompt", href: "/estudio/control/aprovacoes" },
    { label: "Orçamento diário por agente e teto geral", href: "/estudio/control/custos" },
    { label: "Regressão em PR que altera a IA", href: "/estudio/control/avaliacoes" },
    { label: "Agentes, modelos e versões de prompt", href: "/estudio/control/agentes" },
  ],
} as const;
