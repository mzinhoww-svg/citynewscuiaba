import type { PhaseKey, SourceHealthKey } from "@/lib/control/monitor";
import type { RunState } from "@/lib/control/monitor";
import type { StepName } from "@/lib/pipeline/types";

/** Textos do monitoramento do Control Center (P5-T3): visão geral, tempo real, falhas, execuções e logs. */

export const STEP_LABEL: Record<StepName, string> = {
  tick: "Cron",
  fetch: "Buscar",
  validate: "Validar",
  extract: "Extrair",
  normalize: "Normalizar",
  dedupe: "Deduplicar",
  cluster: "Agrupar",
  classify: "Classificar",
  locate: "Localidade",
  verify: "Verificar fontes",
  summarize: "Resumir",
  headline: "Título e linha fina",
  image: "Imagem",
  image_rights: "Direitos da imagem",
  rules: "Regras",
  route: "Rota",
  publish: "Publicar ou exceção",
  record: "Registrar",
  index: "Indexar",
  notify: "Notificar",
};

export const PHASE_LABEL: Record<PhaseKey, string> = {
  coleta: "Coleta",
  analise: "Análise",
  redacao: "Redação",
  decisao: "Decisão",
  encerramento: "Encerramento",
};

export const SOURCE_STATE_LABEL: Record<SourceHealthKey, string> = {
  ok: "Ativa",
  degraded: "Degradada",
  paused: "Pausada",
  paused_auto: "Pausada (auto)",
  blocked: "Bloqueada",
};

export const RUN_STATE_LABEL: Record<RunState, string> = {
  running: "Em andamento",
  ok: "Concluído",
  partial: "Concluído com falhas",
  failed: "Falhou",
};

export const LEVEL_LABEL = {
  info: "Informação",
  warn: "Aviso",
  error: "Erro",
  security: "Segurança",
} as const;

export const QUEUE_LABEL: Record<string, string> = {
  pipeline: "Pipeline",
  media: "Mídia",
  notify: "Notificações",
};

export const AGENT_LABEL: Record<string, string> = {
  classify: "Classificação",
  locate: "Localidade",
  verify: "Verificação",
  write: "Redação (resumo e título)",
  cluster: "Agrupamento",
};

export const MONITOR_TEXT = {
  overview: {
    title: "Visão geral",
    intro:
      "Como o motor está agora: o ciclo mais recente, as filas, as fontes e o que precisa de atenção.",
    loading: "Carregando a visão geral",
    errorTitle: "Não foi possível carregar a visão geral",
    errorBody: "O banco não respondeu agora. O motor segue rodando. Tente de novo em instantes.",
    retry: "Tentar de novo",
    lastRun: "Último ciclo",
    noRun: "Nenhum ciclo ainda",
    noRunBody:
      "Quando o primeiro ciclo rodar, ele aparece aqui. Você também pode iniciar um agora.",
    kpis: "Indicadores do motor",
    sourcesTitle: "Fontes que pedem atenção",
    sourcesAllOk: "Todas as fontes estão coletando normalmente.",
    seeAllSources: "Ver todas as fontes",
    liveLink: "Acompanhar em tempo real",
    failuresLink: "Ver filas e falhas",
    runsLink: "Ver histórico de ciclos",
    logsLink: "Abrir os logs",
  },
  kpi: {
    lastRun: "Último ciclo",
    age: (m: number | null) => (m === null ? "Sem ciclo" : `há ${m} min`),
    late: "Ciclo atrasado (mais de 45 min)",
    onTime: "Ciclos em dia",
    queue: "Na fila",
    quarantine: "Em quarentena",
    errors1h: "Erros na última hora",
    security24h: "Alertas de segurança em 24 h",
    cost24h: "Custo de IA em 24 h",
    aiFailed24h: (n: number, total: number) => `${n} de ${total} chamadas falharam`,
  },
  cycle: {
    title: "Ciclo de 30 minutos",
    caption: "As 20 etapas do último ciclo",
    stepOk: (n: number) => `${n} ok`,
    stepWarn: (n: number) => `${n} ${n === 1 ? "aviso" : "avisos"}`,
    stepErr: (n: number) => `${n} ${n === 1 ? "falha" : "falhas"}`,
    stepPending: (n: number) => `${n} na fila`,
    stepIdle: "sem atividade",
    summary: (ok: number, err: number, pending: number) =>
      `${ok} eventos ok, ${err} falhas e ${pending} mensagens na fila neste ciclo.`,
  },
  jobs: {
    title: "Filas por etapa",
    caption: "Mensagens na fila por etapa",
    empty: "Nenhuma mensagem na fila agora.",
    colQueue: "Fila",
    colStep: "Etapa",
    colTotal: "Na fila",
    colReady: "Prontas",
    colRetrying: "Em nova tentativa",
    colOldest: "Mais antiga",
    colReads: "Maior nº de leituras",
    sortHint: "Ordenar por",
  },
  sources: {
    title: "Saúde das fontes",
    caption: "Estado de coleta de cada fonte",
    empty: "Nenhuma fonte cadastrada.",
    colSource: "Fonte",
    colState: "Estado",
    colFailures: "Falhas seguidas",
    colSuccess: "Coletas ok (30 dias)",
    colItems: "Itens em 24 h",
    colLast: "Última coleta",
    colError: "Último erro",
    never: "Nunca coletada",
    noError: "Sem erro",
    autoNote: "Pausada após 3 falhas seguidas.",
  },
  live: {
    title: "Tempo real",
    intro: "Atualiza a cada 5 segundos enquanto esta aba estiver aberta.",
    loading: "Carregando o tempo real",
    updated: (t: string) => `Atualizado às ${t}`,
    pause: "Pausar atualização",
    resume: "Retomar atualização",
    paused: "Atualização pausada",
    hiddenNote: "Com a aba em segundo plano, a atualização para sozinha.",
    offline: "Sem conexão com o servidor. Mostrando o último retrato e tentando de novo.",
    denied: "Sua sessão expirou. Entre de novo para continuar acompanhando.",
    feedTitle: "Últimos eventos",
    feedEmpty: "Nenhum evento registrado ainda.",
    feedCaption: "Eventos mais recentes do pipeline",
    errorTitle: "Não foi possível carregar o tempo real",
  },
  runNow: {
    button: "Executar agora",
    busy: "Iniciando…",
    hint: "Cria um ciclo fora da janela de 30 minutos e coloca as coletas na fila.",
    done: (n: number) =>
      n === 0
        ? "Ciclo criado. As coletas já estavam na fila."
        : `Ciclo criado com ${n} ${n === 1 ? "coleta" : "coletas"} na fila.`,
    forbidden: "Seu papel não permite iniciar um ciclo.",
    failed: "Não foi possível iniciar o ciclo. Tente de novo.",
  },
  failures: {
    title: "Filas e falhas",
    intro:
      "Mensagens que esgotaram as tentativas, as que estão esperando nova tentativa e as fontes com falhas seguidas.",
    loading: "Carregando as falhas",
    errorTitle: "Não foi possível carregar as falhas",
    errorBody: "O banco não respondeu agora. Nada foi perdido. Tente de novo em instantes.",
    retry: "Tentar de novo",
    quarantineTitle: "Quarentena",
    quarantineCaption: "Mensagens em quarentena",
    quarantineEmpty: "Nada em quarentena",
    quarantineEmptyBody: "Quando uma etapa esgotar as tentativas, a mensagem aparece aqui.",
    quarantineMore: (shown: number, total: number) => `Mostrando ${shown} de ${total}.`,
    retryingTitle: "Esperando nova tentativa",
    retryingCaption: "Mensagens com erro, esperando nova tentativa",
    retryingEmpty: "Nenhuma mensagem esperando nova tentativa.",
    colStep: "Etapa",
    colItem: "Item",
    colError: "Erro",
    colReads: "Tentativas",
    colWhen: "Quando",
    colRetryAt: "Próxima tentativa",
    colAction: "Ação",
    reprocess: "Reprocessar",
    reprocessNamed: (what: string) => `Reprocessar ${what}`,
    sourcesTitle: "Fontes com falhas",
    sourcesEmpty: "Nenhuma fonte com falhas seguidas.",
    done: (n: number) =>
      n === 0
        ? "Nada foi enfileirado: os itens já estavam na fila."
        : `${n} ${n === 1 ? "item voltou" : "itens voltaram"} para a fila.`,
  },
  reprocess: {
    title: "Reprocessar este ciclo",
    intro: "Volta os itens do ciclo para a fila a partir da etapa escolhida.",
    step: "A partir da etapa",
    keep: "Manter decisões humanas",
    keepHint:
      "Ligado, nenhuma decisão de revisão humana muda e o item não volta às etapas que decidem.",
    confirmLabel: "Digite reprocessar para confirmar",
    confirmHint:
      "Sem manter as decisões humanas, elas são descartadas. Fica registrado na auditoria.",
    submit: "Reprocessar",
    forbidden: "Seu papel não permite reprocessar.",
    invalid: "Confira a etapa e a confirmação e tente de novo.",
    confirmWord: "reprocessar",
    failed: "Não foi possível reprocessar. Tente de novo.",
  },
  runs: {
    title: "Execuções",
    intro: "Histórico dos ciclos: duração, eventos, falhas e custo de IA de cada um.",
    loading: "Carregando as execuções",
    errorTitle: "Não foi possível carregar as execuções",
    errorBody: "O banco não respondeu agora. Tente de novo em instantes.",
    retry: "Tentar de novo",
    empty: "Nenhum ciclo registrado",
    emptyBody: "Quando o primeiro ciclo rodar, ele aparece aqui.",
    caption: "Ciclos mais recentes",
    colWindow: "Ciclo",
    colState: "Situação",
    colDuration: "Duração",
    colEvents: "Eventos",
    colErrors: "Falhas",
    colQueue: "Na fila",
    colCost: "Custo de IA",
    manual: "Manual",
    scheduled: "Agendado",
    open: (when: string) => `Abrir o ciclo de ${when}`,
  },
  run: {
    back: "Voltar às execuções",
    notFound: "Ciclo não encontrado",
    notFoundBody: "Este ciclo não existe ou foi removido pela retenção.",
    loading: "Carregando o ciclo",
    errorTitle: "Não foi possível carregar o ciclo",
    title: (when: string) => `Ciclo de ${when}`,
    phasesTitle: "Duração por fase",
    phasesChart: "Gráfico de barras: duração de cada fase do ciclo",
    phasesSummary: (parts: string) => `Duração por fase: ${parts}.`,
    phaseNone: "sem eventos",
    stepsTitle: "Itens por etapa",
    stepsCaption: "Eventos do ciclo por etapa",
    colStep: "Etapa",
    failuresTitle: "Falhas e avisos",
    failuresEmpty: "Nenhuma falha ou aviso neste ciclo.",
    seeLogs: "Ver todos os eventos deste ciclo",
    kind: "Origem",
    cost: "Custo de IA",
    events: "Eventos",
  },
  logs: {
    title: "Logs",
    intro:
      "Registro das etapas do pipeline. Endereços IP aparecem mascarados, exceto para administradores.",
    loading: "Carregando os logs",
    errorTitle: "Não foi possível carregar os logs",
    errorBody: "O banco não respondeu agora. Tente de novo em instantes.",
    retry: "Tentar de novo",
    filters: "Filtros dos logs",
    run: "Ciclo (código)",
    item: "Item",
    source: "Fonte",
    step: "Etapa",
    level: "Nível",
    agent: "Agente",
    query: "Buscar na mensagem",
    any: "Todos",
    apply: "Filtrar",
    clear: "Limpar filtros",
    empty: "Nenhum evento com estes filtros",
    emptyBody: "Amplie o período ou remova algum filtro.",
    caption: "Eventos do pipeline",
    colWhen: "Quando",
    colLevel: "Nível",
    colStep: "Etapa",
    colItem: "Item",
    colMessage: "Mensagem",
    details: "Detalhes",
    newer: "Mais recentes",
    older: "Mais antigos",
    page: (n: number) => `Página ${n}`,
    export: "Exportar CSV",
    exportNote: "Até 5.000 eventos com os filtros atuais.",
    maskedNote: "IPs mascarados para o seu papel.",
  },
  sort: {
    by: (col: string) => `Ordenar por ${col}`,
    asc: "crescente",
    desc: "decrescente",
  },
} as const;

export function ageLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "sem registro";
  const min = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.floor(h / 24)} d`;
}

/** "em 3 min" para um instante futuro (próxima tentativa); no passado, "agora". */
export function untilLabel(iso: string, now: Date = new Date()): string {
  const min = Math.ceil((Date.parse(iso) - now.getTime()) / 60_000);
  if (Number.isNaN(min) || min <= 0) return "agora";
  if (min < 60) return `em ${min} min`;
  return `em ${Math.round(min / 60)} h`;
}

export const brl = (n: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
