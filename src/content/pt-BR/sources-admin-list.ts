import type { SourceStatus } from "@/lib/sources/types";
import type { HealthState, SourceSort } from "@/lib/db/queries/sources-admin";
import { durationLabel } from "./sources-admin";

/** Textos da lista de fontes (Control Center · Fontes, tela O03; P5-T4/FS-T7). */

export const SOURCES_LIST_TEXT = {
  metaTitle: "Fontes · Control Center · CityNews Cuiabá",
  title: "Fontes",
  intro:
    "Veículos e feeds que o CityNews coleta. Filtre, ordene, pause em lote e ajuste a frequência da coleta.",
  newSource: "Nova fonte",
  loading: "Carregando as fontes",
  results: (n: number) => (n === 1 ? "1 fonte" : `${n} fontes`),
  tableCaption: "Fontes cadastradas, com estado, relevância, saúde, frequência e última coleta",
  listLabel: "Lista de fontes",
  columns: {
    select: "Selecionar",
    name: "Fonte",
    status: "Estado",
    score: "Relevância",
    health: "Saúde",
    frequency: "Frequência",
    last: "Última coleta",
    actions: "Ações",
  },
  sortable: {
    name: "Fonte",
    status: "Estado",
    score: "Saúde",
    frequency: "Frequência",
    last: "Última coleta",
  } as Record<SourceSort, string>,
  selectRow: (name: string) => `Selecionar ${name}`,
  selectAll: "Selecionar todas as fontes desta página",
  neverCollected: "Ainda não coletada",
  errors24h: (n: number) => (n === 1 ? "1 erro hoje" : `${n} erros hoje`),
  approvalPending: "Mudança aguardando aprovação",
  layerShort: (n: number) => `Camada ${n}`,
  noLayer: "Sem camada",
  openSource: (name: string) => `Abrir ${name}`,
  rowActions: {
    collect: "Coletar agora",
    collectFor: (name: string) => `Coletar agora: ${name}`,
    pause: "Pausar",
    pauseFor: (name: string) => `Pausar ${name}`,
    resume: "Reativar",
    resumeFor: (name: string) => `Reativar ${name}`,
    activate: "Ativar",
    activateFor: (name: string) => `Ativar ${name} na página da fonte`,
    running: "Enviando",
  },
  filters: {
    label: "Filtros da lista de fontes",
    search: "Buscar por nome ou endereço",
    searchPlaceholder: "Nome, identificador ou endereço",
    status: "Estado",
    layer: "Camada",
    via: "Via de coleta",
    health: "Saúde",
    reliability: "Confiabilidade",
    locality: "Localidade",
    archived: "Arquivadas",
    any: "Todas",
    anyM: "Todos",
    apply: "Aplicar filtros",
    clear: "Limpar filtros",
    active: (n: number) => (n === 1 ? "1 filtro ativo" : `${n} filtros ativos`),
    via_: { rapida: "Via rápida", normal: "Ciclo normal" },
    archivedOptions: { no: "Ocultar", only: "Só arquivadas", all: "Mostrar junto" },
  },
  statusOption: {
    active: "Ativa",
    paused: "Pausada",
    degraded: "Instável",
    blocked: "Bloqueada",
  } as Record<SourceStatus, string>,
  healthOption: {
    saudavel: "Saudável",
    atencao: "Atenção",
    critica: "Crítica",
    sem_dados: "Sem dados",
  } as Record<HealthState, string>,
  layerOption: {
    1: "Camada 1 · Oficial",
    2: "Camada 2 · Portal local",
    3: "Camada 3 · Temático ou regional",
    4: "Camada 4 · Nacional",
  } as Record<number, string>,
  pagination: {
    label: "Paginação da lista de fontes",
    prev: "Página anterior",
    next: "Próxima página",
    of: (page: number, total: number) => `Página ${page} de ${total}`,
  },
  empty: {
    title: "Nenhuma fonte cadastrada ainda",
    body: "Cadastre a primeira fonte a partir do link do site, do feed ou do sitemap de notícias.",
    filteredTitle: "Nenhuma fonte com esses filtros",
    filteredBody: "Tire um filtro ou limpe todos para ver as fontes cadastradas.",
    clear: "Limpar filtros",
  },
  error: {
    title: "Não foi possível carregar as fontes",
    body: "Nada foi alterado. Seus filtros continuam no endereço da página.",
    retry: "Tentar de novo",
  },
  bulk: {
    label: "Ações em lote",
    selected: (n: number) => (n === 1 ? "1 fonte selecionada" : `${n} fontes selecionadas`),
    none: "Selecione fontes para pausar, ativar ou mudar a frequência de até 50 de uma vez.",
    limit: "O lote aceita até 50 fontes.",
    clear: "Limpar seleção",
    pause: "Pausar",
    activate: "Ativar",
    frequency: "Frequência",
    confirmPause: (n: number) => `Pausar ${n === 1 ? "1 fonte" : `${n} fontes`}`,
    confirmActivate: (n: number) => `Ativar ${n === 1 ? "1 fonte" : `${n} fontes`}`,
    confirmFrequency: (n: number) => `Mudar a frequência de ${n === 1 ? "1 fonte" : `${n} fontes`}`,
    titlePause: (n: number) => `Pausar ${n === 1 ? "1 fonte" : `${n} fontes`}?`,
    titleActivate: (n: number) => `Ativar ${n === 1 ? "1 fonte" : `${n} fontes`}?`,
    titleFrequency: (n: number) => `Mudar a frequência de ${n === 1 ? "1 fonte" : `${n} fontes`}?`,
    bodyPause: "Elas deixam de ser coletadas até alguém reativar. Itens e matérias são mantidos.",
    bodyActivate:
      "Só valem fontes que já foram ativadas antes. A primeira ativação exige o teste de conexão, na página da fonte.",
    bodyFrequency:
      "Frequências abaixo de 30 minutos usam a via rápida e dependem das vagas livres. Fontes sem vaga são ignoradas, com o motivo.",
    frequencyLabel: "Nova frequência",
    cancel: "Cancelar",
    skippedTitle: "Fontes ignoradas no lote",
  },
  approvals: {
    title: (n: number) =>
      n === 1
        ? "1 mudança crítica aguarda segunda aprovação"
        : `${n} mudanças críticas aguardam segunda aprovação`,
    intro: "Mudanças que ampliam direitos de uma fonte só valem quando outra pessoa aprova.",
    field: (field: string, value: string) => `${field}: ${value}`,
    by: (who: string) => `pedido por ${who}`,
    unknownPerson: "alguém da equipe",
    unknownSource: "Fonte",
    review: "Ver aprovações",
    more: (n: number) => (n === 1 ? "e mais 1 pedido" : `e mais ${n} pedidos`),
  },
  fastSkipped: {
    title: "Fontes puladas por falta de vaga na via rápida",
    body: (names: string) =>
      `Na última rodada da via rápida, estas fontes ficaram de fora porque as vagas estavam ocupadas: ${names}. Aumente o limite ou tire uma fonte da via rápida.`,
  },
  settings: {
    open: "Configurações da coleta",
    title: "Configurações da coleta",
    intro:
      "Valem para todas as fontes que não têm frequência própria e para as vagas da via rápida.",
    defaultLabel: "Frequência padrão",
    defaultHint:
      "Só o ciclo normal, de 30 minutos a 24 horas. Quem precisa de menos de 30 minutos usa a via rápida, fonte por fonte.",
    save: "Salvar frequência padrão",
    fastMaxLabel: "Vagas da via rápida",
    fastMaxHint: "De 0 a 20. Reduzir o limite não tira fontes que já estão na via rápida.",
    saveFast: "Salvar vagas",
    lane: (used: number, max: number) => `Via rápida: ${used} de ${max}`,
    laneIdle: (n: number) =>
      n === 0
        ? ""
        : n === 1
          ? "1 fonte na via rápida não está coletando (pausada ou bloqueada)."
          : `${n} fontes na via rápida não estão coletando (pausadas ou bloqueadas).`,
    close: "Fechar",
  },
} as const;

/** Opções da frequência padrão: só a grade do ciclo normal, 30 a 1440 em múltiplos de 30. */
export const DEFAULT_FREQUENCY_OPTIONS: readonly { value: string; label: string }[] = Array.from(
  { length: 48 },
  (_, i) => {
    const min = (i + 1) * 30;
    return { value: String(min), label: durationLabel(min) };
  },
);

/** Opções da frequência por fonte no lote: padrão, via rápida (10, 15, 20) e a grade normal. */
export const BULK_FREQUENCY_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "default", label: "Seguir o padrão" },
  { value: "10", label: "10 min · via rápida" },
  { value: "15", label: "15 min · via rápida" },
  { value: "20", label: "20 min · via rápida" },
  ...DEFAULT_FREQUENCY_OPTIONS,
];
