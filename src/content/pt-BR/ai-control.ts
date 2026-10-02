/** Textos da IA no Control Center (P5-T6): custos, bases, avaliações e governança. */
import type { GateFailure } from "@/lib/ai/eval";

export const AGENT_NAME: Record<string, string> = {
  classify: "Classificação",
  locate: "Localidade",
  verify: "Verificação",
  write: "Redação",
  answer: "Busca com IA",
  image: "Imagem",
  aggregate_summary: "Resumo do agregado",
  embed: "Embeddings",
  source_profiler: "Perfil de fonte",
};
export const agentName = (id: string) => AGENT_NAME[id] ?? id;

const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
export const formatPct = (n: number) => pct.format(n);
const int = new Intl.NumberFormat("pt-BR");
export const formatInt = (n: number) => int.format(n);
const dec = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const formatDec = (n: number) => dec.format(n);

export const GATE_LABEL: Record<GateFailure, string> = {
  minPrecision: "precisão abaixo de 90%",
  minCoverage: "cobertura abaixo de 80%",
  maxUnsourced: "frase sem fonte",
  maxHallucinationsPer100: "mais de 2 alucinações a cada 100 fatos",
  maxRefusalsWrong: "recusa errada",
  maxP95Ms: "p95 acima de 8 s",
};

export const AI_TEXT = {
  sectionLabel: "Control Center · IA",
  retry: "Tentar de novo",
  errorTitle: "Não foi possível carregar",
  errorBody: "O banco não respondeu. Tente de novo em instantes.",
  forbidden: "Seu papel não permite esta ação.",
  genericError: "Não foi possível concluir. Tente de novo.",
  none: "—",
  chartSummary: "Resumo do gráfico",

  costs: {
    title: "Custos e limites",
    intro:
      "Gasto de IA por dia, agente e modelo. O orçamento diário zera à meia-noite de Cuiabá; a 90% o Control Center avisa e a 100% as chamadas param.",
    kpis: "Indicadores de custo",
    today: "Hoje",
    last7: "Últimos 7 dias",
    last30: "Últimos 30 dias",
    perArticle: "Custo por matéria publicada (30 d)",
    perArticleTarget: "meta: até R$ 4,00",
    perArticleNone: "Sem matéria publicada",
    errorRate: "Erros de IA (7 d)",
    budgetOf: (b: string) => `de ${b} por dia`,
    chartTitle: "Gasto diário, últimos 30 dias",
    chartLabel: (budget: string) =>
      `Gasto de IA por dia nos últimos 30 dias, com a linha do orçamento diário de ${budget}`,
    chartSummaryLine: (max: string, day: string, avg: string, over: number) =>
      `Maior gasto: ${max} em ${day}. Média diária: ${avg}. Dias acima de 90% do orçamento: ${over}.`,
    chartDay: "Dia",
    chartCost: "Gasto",
    budgetLine: "Orçamento diário",
    outOfScale: "acima da escala do gráfico",
    agentsTitle: "Por agente",
    agentsCaption: "Gasto de IA por agente: hoje contra o orçamento e últimos 7 dias",
    agentCol: {
      agent: "Agente",
      today: "Hoje",
      budget: "Orçamento/dia",
      used: "Usado",
      last7: "7 dias",
      calls: "Chamadas 7 d",
      errors: "Erros 7 d",
      fallbacks: "Fallback 7 d",
      latency: "Latência média",
    },
    overBudget: "No limite",
    nearBudget: "Perto do limite",
    modelsTitle: "Por modelo (30 dias)",
    modelsCaption: "Gasto de IA por modelo nos últimos 30 dias",
    modelCol: {
      model: "Modelo",
      cost: "Gasto",
      calls: "Chamadas",
      tokens: "Tokens (entrada/saída)",
    },
    empty: "Nenhuma chamada de IA nos últimos 30 dias.",
    noAccess: "Seu papel não vê os custos por chamada. Peça acesso a quem administra.",
  },

  knowledge: {
    title: "Bases de conhecimento",
    intro:
      "O que a IA consulta para responder e redigir, e quanto já está indexado para busca textual e por significado.",
    caption: "Bases de conhecimento da IA",
    col: {
      base: "Base",
      use: "Uso pela IA",
      total: "Registros",
      indexed: "Busca textual",
      embedded: "Busca por significado",
      updated: "Última atualização",
    },
    bases: {
      articles: { name: "Matérias publicadas", use: "Busca com IA e Semelhantes" },
      aggregated: { name: "Itens de outros veículos", use: "Verificação, agrupamento e Panorama" },
      topics: { name: "Assuntos", use: "Agrupamento de itens (centróide)" },
      events: { name: "Agenda", use: "Busca e perguntas sobre eventos" },
      sources: { name: "Fontes cadastradas", use: "Confiabilidade e fonte primária" },
    } as Record<string, { name: string; use: string }>,
    activeSources: "ativas",
    notApplicable: "não se aplica",
    dictionaryTitle: "Dicionário de bairros",
    dictionaryText: (n: number) =>
      `${n} bairros de Cuiabá e Várzea Grande. A localidade usa o dicionário primeiro; o agente só confirma bairros que estão nele.`,
    pendingNote:
      "Registros sem busca por significado aguardam a etapa 19 (indexar) ou o provedor de embeddings. Com o provedor falso, os vetores são de teste.",
    empty: "Nenhuma base disponível.",
    logsLink: "Ver logs da indexação",
  },

  evals: {
    title: "Avaliações e regressão",
    intro:
      "Casos fixos da busca com IA rodados pelo mesmo caminho de produção. A regressão roda também em todo PR que muda a IA, com o provedor falso.",
    agent: "Agente",
    promptVersion: "Versão do prompt",
    production: (v: number) => `v${v} · em produção`,
    version: (v: number, status: string) => `v${v} · ${status}`,
    run: "Rodar avaliação",
    running: "Rodando…",
    ran: (passed: boolean, n: number) =>
      passed
        ? `Avaliação concluída: ${n} casos, dentro dos limites.`
        : `Avaliação concluída: ${n} casos, com limites violados.`,
    noCases: "Nenhum caso ativo para este agente. Ative ao menos um caso.",
    noPrompt: "Versão de prompt não encontrada.",
    readOnly: "Seu papel vê as avaliações, mas não roda.",
    thresholdsTitle: "Limites",
    thresholds:
      "Precisão ≥ 90%, cobertura ≥ 80%, nenhuma frase sem fonte, até 2 alucinações a cada 100 fatos, nenhuma recusa errada e p95 até 8 s.",
    latestTitle: "Última rodada",
    metricsLabel: "Métricas da última rodada",
    metric: {
      precision: "Precisão",
      coverage: "Cobertura",
      unsourced: "Frases sem fonte",
      hallucinationsPer100: "Alucinações / 100 fatos",
      refusalsCorrect: "Recusas corretas",
      refusalsWrong: "Recusas erradas",
      p95: "Latência p95",
    },
    passed: "Dentro dos limites",
    failed: "Limites violados",
    failedList: (items: string) => `Limites violados: ${items}.`,
    historyTitle: "Histórico",
    historyCaption: "Rodadas de avaliação, da mais recente para a mais antiga",
    historyCol: {
      when: "Quando",
      prompt: "Prompt",
      trigger: "Origem",
      provider: "Provedor",
      precision: "Precisão",
      coverage: "Cobertura",
      refusals: "Recusas erradas",
      result: "Resultado",
    },
    trigger: { manual: "Manual", ci: "CI (PR)", publish: "Publicação" } as Record<string, string>,
    provider: { fake: "Falso (teste)", openrouter: "OpenRouter" } as Record<string, string>,
    noRuns: "Nenhuma rodada registrada ainda.",
    casesTitle: "Casos de regressão",
    casesCaption: "Casos de regressão do agente",
    caseCol: {
      key: "Caso",
      question: "Pergunta",
      expect: "Esperado",
      sources: "Fontes",
      active: "Ativo",
    },
    expectRefuse: "Recusar",
    expectAnswer: (n: number) => (n === 1 ? "Responder com 1 fato" : `Responder com ${n} fatos`),
    noCasesList: "Nenhum caso cadastrado. A regressão do CI usa os casos de tests/fixtures/eval.",
    toggleOn: (k: string) => `Ativar o caso ${k}`,
    toggleOff: (k: string) => `Desativar o caso ${k}`,
    toggled: "Caso atualizado.",
  },

  governance: {
    title: "Governança da IA",
    intro:
      "Regras que a IA sempre segue, quem responde por cada agente e o estado das salvaguardas.",
    flagsTitle: "Salvaguardas",
    aiEnabled: "IA ligada",
    aiDisabled: "IA desligada (busca tradicional no lugar da busca com IA)",
    reproOn: "Reprodução de imagem de terceiros ligada",
    reproOff: "Reprodução de imagem de terceiros desligada",
    security: (n: number) =>
      n === 1
        ? "1 tentativa de instrução embutida detectada em 30 dias (item em quarentena)"
        : `${n} tentativas de instrução embutida detectadas em 30 dias (itens em quarentena)`,
    approvals: (n: number) =>
      n === 1 ? "1 aprovação de prompt pendente" : `${n} aprovações de prompt pendentes`,
    principlesTitle: "Regras fixas",
    principles: [
      "A IA nunca responde sem fonte: com menos de 2 fontes relevantes, a busca com IA recusa e explica.",
      "Fato, inferência e lacuna aparecem separados, e todo fato cita ao menos uma fonte.",
      "Texto coletado é dado, nunca instrução: passa por sanitização e vai ao modelo entre delimitadores de dados.",
      "Publicação automática segue regras versionadas; segurança e urgente nunca publicam sozinhos.",
      "Imagem gerada nunca é fotorrealista de pessoa real e nunca ilustra crime, tragédia ou saúde individual.",
      "Personalização só com consentimento; nenhum atributo protegido é inferido.",
      "Prompt em produção e desligar salvaguardas exigem duas pessoas diferentes.",
    ],
    agentsTitle: "Agentes",
    agentsCaption: "Agentes de IA: função, modelo, prompt em produção e última avaliação",
    agentCol: {
      agent: "Agente",
      fn: "Função",
      model: "Modelo (fallback)",
      prompt: "Prompt",
      budget: "Orçamento/dia",
      eval: "Última avaliação",
      status: "Situação",
    },
    enabled: "Ligado",
    disabled: "Desligado",
    noPrompt: "sem prompt",
    pending: (n: number) => (n === 1 ? "1 versão aguardando" : `${n} versões aguardando`),
    evalPassed: "Dentro dos limites",
    evalFailed: "Limites violados",
    evalNone: "Sem regressão automática",
    promptsTitle: "Versões de prompt recentes",
    promptsCaption: "Versões de prompt recentes com assinaturas",
    promptCol: {
      agent: "Agente",
      version: "Versão",
      status: "Situação",
      approvals: "Assinaturas",
      when: "Criada em",
    },
    promptStatus: {
      draft: "Rascunho",
      pending: "Aguardando aprovação",
      production: "Em produção",
      archived: "Arquivada",
      reverted: "Revertida",
    } as Record<string, string>,
    links: { costs: "Custos e limites", evals: "Avaliações", knowledge: "Bases de conhecimento" },
  },
} as const;
