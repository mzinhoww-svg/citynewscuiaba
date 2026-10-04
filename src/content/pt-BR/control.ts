/** Textos do Control Center (P5): visão geral, tempo real, falhas, execuções e logs. */
import type { AlertId, PhaseId, RunState } from "@/lib/control";

export const PHASE_LABEL: Record<PhaseId, string> = {
  coleta: "Coleta",
  entendimento: "Entendimento",
  verificacao: "Verificação",
  redacao: "Redação",
  midia: "Mídia",
  publicacao: "Publicação",
};

export const STEP_LABEL: Record<string, string> = {
  tick: "1 · Cron",
  fetch: "2 · Buscar",
  validate: "3 · Validar",
  extract: "4 · Extrair",
  normalize: "5 · Normalizar",
  enrich: "5b · Enriquecer",
  dedupe: "6 · Deduplicar",
  cluster: "7 · Agrupar",
  classify: "8 · Classificar",
  locate: "9 · Localidade",
  verify: "10 · Verificar fontes",
  summarize: "11 · Resumir",
  headline: "12 · Título e linha fina",
  image: "13 · Imagem",
  image_rights: "14 · Direitos da imagem",
  rules: "15 · Regras",
  route: "16 · Rota",
  publish: "17 · Publicar",
  record: "18 · Registrar",
  index: "19 · Indexar",
  notify: "20 · Notificar",
};

export const stepLabel = (step: string) => STEP_LABEL[step] ?? step;

export const RUN_STATE_LABEL: Record<RunState, string> = {
  running: "Em andamento",
  partial: "Com falhas",
  ok: "Concluído",
  empty: "Sem coleta",
  failed: "Falhou",
};

export const LEVEL_LABEL: Record<string, string> = {
  info: "Informação",
  warn: "Nova tentativa",
  error: "Erro",
  security: "Segurança",
};

export const SOURCE_STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  paused: "Pausada",
  degraded: "Degradada",
  blocked: "Bloqueada",
};

export const QUEUE_LABEL: Record<string, string> = {
  pipeline: "Pipeline",
  media: "Mídia",
  notify: "Avisos",
};

/** Agentes de IA (filtro "agente" dos logs; etapas em `AGENT_STEPS`). */
export const AGENT_LABEL: Record<string, string> = {
  classify: "Classificação",
  locate: "Localidade",
  verify: "Verificação",
  write: "Redação",
  image: "Imagem",
  aggregate_summary: "Resumo do agregado",
  embed: "Embeddings",
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBrl = (n: number) => brl.format(n);
const dec1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const formatMin = (n: number | null) => (n === null ? "—" : `${dec1.format(n)} min`);

export const ALERT_TEXT: Record<AlertId, (v: Record<string, string | number>) => string> = {
  tick_late: (v) =>
    Number(v.minutes) < 0
      ? "Nenhum ciclo registrado. O cron ou o watchdog não chamaram o tick."
      : `O último ciclo começou há ${v.minutes} min (limite: 45 min). Verifique o cron e o watchdog.`,
  queue_backlog: (v) => `Fila com ${v.total} mensagens (limite: 2.000).`,
  error_rate: (v) =>
    `Taxa de erro de ${String(v.percent).replace(".", ",")}% na última hora (limite: 2%).`,
  budget: (v) => `Gasto de IA hoje em ${v.percent}% do orçamento diário.`,
  source_paused: (v) => `Fonte pausada automaticamente por 3 falhas seguidas: ${v.names}.`,
};

export const CONTROL_TEXT = {
  sectionLabel: "Control Center",
  retry: "Tentar de novo",
  errorTitle: "Não foi possível carregar",
  errorBody: "O banco não respondeu. Seus filtros foram mantidos; tente de novo em instantes.",
  forbidden: "Seu papel não permite esta ação.",
  genericError: "Não foi possível concluir. Tente de novo.",
  none: "—",
  chartSummary: "Resumo do gráfico",
  sortBy: (col: string) => `Ordenar por ${col}`,
  sortedAsc: "ordem crescente",
  sortedDesc: "ordem decrescente",

  nav: {
    overview: "Visão geral",
    live: "Tempo real",
    failures: "Falhas",
    runs: "Execuções",
    logs: "Logs",
    sources: "Fontes",
  },

  overview: {
    title: "Visão geral",
    intro: "Estado do ciclo de 30 minutos, da fila, das fontes e dos custos de IA.",
    kpis: "Indicadores da operação",
    lastRun: "Último ciclo",
    nextWindow: "Próxima janela",
    queue: "Mensagens na fila",
    quarantine: "Em quarentena",
    errors1h: "Erros na última hora",
    spend: "Gasto de IA hoje",
    noRun: "Nenhum",
    alertsTitle: "Alertas",
    noAlerts: "Nenhum alerta: ciclo, fila, erros, custo e fontes dentro dos limites.",
    notificationsTitle: "Avisos do pipeline",
    cyclesTitle: "Ciclos recentes",
    cyclesLabel: "Ciclos recentes, do mais novo para o mais antigo",
    sourcesTitle: "Saúde das fontes",
    sourcesLink: "Administrar fontes",
    runNow: "Executar agora",
    runNowSource: "Fonte",
    runNowAll: "Todas as fontes ativas",
    runNowHint:
      "Todas as fontes: cria um ciclo fora da janela. Uma fonte: a mesma coleta manual do painel de fontes (1 a cada 5 minutos por fonte).",
    runNowOk: (n: number) =>
      n === 1 ? "Ciclo iniciado: 1 coleta na fila." : `Ciclo iniciado: ${n} coletas na fila.`,
    runNowCollecting:
      "O ciclo anterior ainda está coletando. Tente de novo quando a Coleta terminar.",
    runNowInactive: "Esta fonte não está ativa. Ative a fonte antes de coletar.",
    runNowRateLimited:
      "Coleta manual limitada: uma vez a cada 5 minutos por fonte e 20 por hora por pessoa.",
    runNowNotFound: "Fonte não encontrada.",
    seeAll: "Ver todas as execuções",
    budgetOf: (b: string) => `de ${b}`,
  },

  cycle: {
    manual: "Manual",
    events: (n: number) => (n === 1 ? "1 evento" : `${n} eventos`),
    link: (when: string, state: string) => `Ciclo de ${when}, ${state}`,
  },

  health: {
    caption: "Saúde das fontes: status, falhas seguidas, erros e itens nas últimas 24 horas",
    col: {
      name: "Fonte",
      status: "Status",
      failures: "Falhas seguidas",
      errors24h: "Erros 24 h",
      items24h: "Itens 24 h",
      success: "Sucesso 30 d",
      last: "Última coleta",
    },
    /** Mesmo texto do painel de fontes (`SOURCE_STATUS_TEXT.auto_paused`, R8). */
    autoPaused: "Pausada automaticamente",
    never: "Nunca",
    empty: "Nenhuma fonte cadastrada.",
  },

  live: {
    title: "Tempo real",
    intro: "Atualiza a cada 5 segundos enquanto esta aba estiver aberta.",
    paused: "Atualização pausada enquanto a aba está em segundo plano.",
    updatedAt: (t: string) => `Atualizado às ${t}`,
    stale: "Não foi possível atualizar. Mostrando os últimos dados.",
    pausedByUser: "Atualização pausada.",
    runState: (state: string) => `Ciclo atual: ${state}.`,
    noRun: "Nenhum ciclo em andamento.",
    pause: "Pausar atualização",
    resume: "Retomar atualização",
    phasesTitle: "Ciclo atual por fase",
    queueTitle: "Fila por etapa",
    queueCaption:
      "Mensagens na fila por etapa: prontas, em processamento e aguardando nova tentativa",
    col: {
      step: "Etapa",
      queue: "Fila",
      ready: "Prontas",
      inFlight: "Processando",
      retrying: "Nova tentativa",
    },
    queueEmpty: "Fila vazia.",
    eventsTitle: "Últimos eventos",
    eventsEmpty: "Nenhum evento registrado ainda.",
    phaseEmpty: "Sem eventos nesta fase.",
  },

  failures: {
    title: "Filas e falhas",
    intro:
      "Mensagens em quarentena (tentativas esgotadas ou erro não recuperável) e mensagens aguardando nova tentativa.",
    caption: "Falhas do pipeline",
    col: {
      select: "Selecionar",
      kind: "Situação",
      step: "Etapa",
      item: "Objeto",
      error: "Erro",
      attempts: "Tentativas",
      at: "Quando",
    },
    kind: { quarantine: "Quarentena", retrying: "Nova tentativa" },
    selectRow: (item: string) => `Selecionar ${item}`,
    selected: (n: number) => (n === 1 ? "1 selecionada" : `${n} selecionadas`),
    reprocess: "Reprocessar selecionadas",
    discard: "Descartar selecionadas",
    keepHuman: "Manter decisões humanas",
    keepHumanHint:
      "Matérias editadas, aprovadas ou recusadas por uma pessoa ficam de fora. Nenhuma decisão é apagada.",
    empty: "Nenhuma falha aberta. O pipeline está em dia.",
    readOnly: "Seu papel vê as falhas, mas não reprocessa.",
    nothingSelected: "Selecione ao menos uma falha em quarentena.",
    discarded: (n: number) => (n === 1 ? "1 falha descartada." : `${n} falhas descartadas.`),
    discardConfirm: "Descartar falhas",
    discardText:
      "As mensagens saem da quarentena sem voltar à fila. O registro fica nos logs. Descreva o motivo.",
    reason: "Motivo",
    reasonRequired: "Informe o motivo.",
    cancel: "Cancelar",
    retryingNote:
      "Mensagens aguardando nova tentativa voltam sozinhas; só a quarentena é reprocessada.",
  },

  reprocess: {
    title: "Reprocessar",
    fromStep: "A partir da etapa",
    submit: "Reprocessar ciclo",
    result: (o: { enqueued: number; skippedHuman: number; alreadyQueued: number }) => {
      const parts = [
        o.enqueued === 1 ? "1 objeto voltou à fila" : `${o.enqueued} objetos voltaram à fila`,
      ];
      if (o.skippedHuman > 0)
        parts.push(
          o.skippedHuman === 1
            ? "1 mantido pela decisão humana"
            : `${o.skippedHuman} mantidos pela decisão humana`,
        );
      if (o.alreadyQueued > 0) parts.push(`${o.alreadyQueued} já estavam na fila`);
      return `${parts.join("; ")}.`;
    },
    invalid: "Escolha uma etapa válida e um escopo.",
  },

  runs: {
    title: "Execuções",
    intro: "Histórico dos ciclos: duração, itens por etapa, falhas e custo de IA no período.",
    caption: "Ciclos do pipeline",
    col: {
      when: "Início",
      state: "Situação",
      duration: "Duração",
      ok: "Etapas concluídas",
      failed: "Falhas",
      pending: "Na fila",
      cost: "Custo de IA",
    },
    empty: "Nenhum ciclo registrado. Use Executar agora na visão geral.",
    costNote: "Custo de IA do período do ciclo (do início dele ao início do seguinte).",
    open: (when: string) => `Abrir ciclo de ${when}`,
  },

  run: {
    back: "Execuções",
    title: (when: string) => `Ciclo de ${when}`,
    notFound: "Ciclo não encontrado.",
    summaryTitle: "Resumo",
    phasesTitle: "Fases do ciclo",
    phasesChart: "Duração de cada fase do ciclo, em minutos desde o início",
    phasesEmpty: "Nenhum evento registrado neste ciclo.",
    stepsTitle: "Itens por etapa",
    stepsCaption: "Eventos por etapa do ciclo",
    stepsCol: {
      step: "Etapa",
      ok: "Concluídos",
      warn: "Novas tentativas",
      error: "Erros",
      window: "Janela",
    },
    failuresTitle: "Falhas do ciclo",
    failuresEmpty: "Nenhuma falha neste ciclo.",
    logsLink: "Ver todos os logs do ciclo",
    phaseLine: (phase: string, start: string, duration: string, ok: number, failed: number) =>
      `${phase}: começou em ${start} e durou ${duration}; ${ok} concluídos, ${failed} com falha.`,
    fields: {
      window: "Janela",
      started: "Início",
      state: "Situação",
      duration: "Duração",
      fetch: "Coletas enfileiradas",
      cost: "Custo de IA",
      calls: "Chamadas de IA",
      manual: "Execução manual",
    },
  },

  logs: {
    title: "Logs",
    intro: "Registro das etapas do pipeline, do mais novo para o mais antigo.",
    filters: "Filtros",
    run: "Ciclo (id)",
    item: "Item ou objeto (ex.: item:…, article:…)",
    source: "Fonte",
    step: "Etapa",
    level: "Nível",
    agent: "Agente de IA",
    q: "Buscar no texto",
    any: "Todos",
    apply: "Filtrar",
    clear: "Limpar filtros",
    export: "Exportar CSV",
    more: "Carregar mais antigos",
    caption: "Eventos do pipeline",
    col: { at: "Quando", level: "Nível", step: "Etapa", item: "Objeto", message: "Mensagem" },
    empty: "Nenhum evento com estes filtros.",
    emptyAction: "Limpar filtros",
    masked: "IPs aparecem mascarados para quem não é admin.",
    count: (n: number) => (n === 1 ? "1 evento" : `${n} eventos`),
    details: "Detalhes",
  },
} as const;
