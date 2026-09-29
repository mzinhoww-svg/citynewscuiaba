/**
 * Textos do painel de fontes (spec docs/superpowers/specs/2026-09-27-painel-de-fontes.md §7–§9):
 * rótulos de status, motivos, camadas, políticas, mensagens das ações e de erro.
 */
// Só o schema e tipos: o barrel `@/lib/sources` puxa `url.ts` → `pipeline/net.ts` (node:dns), que
// não pode entrar no bundle do navegador (este arquivo é lido por Client Components).
import type { HealthLabel } from "@/lib/sources/health";
import { FAST_FREQUENCIES } from "@/lib/sources/schema";
import type {
  ImagePolicy,
  Reliability,
  RepublishPolicy,
  SourceStatus,
  StatusReason,
} from "@/lib/sources/types";

/** Status exibido: os quatro do banco, mais "pausada automaticamente" e "arquivada". */
export type DisplayStatus = SourceStatus | "auto_paused" | "archived";

export const SOURCE_STATUS_TEXT: Record<DisplayStatus, string> = {
  active: "Ativa",
  degraded: "Com falhas",
  paused: "Pausada",
  auto_paused: "Pausada automaticamente",
  blocked: "Bloqueada",
  archived: "Arquivada",
};

export const STATUS_REASON_TEXT: Record<StatusReason, string> = {
  pending_activation: "Aguardando ativação",
  manual: "Pausada por uma pessoa",
  auto_failures: "Após 3 falhas seguidas",
  robots: "O robots.txt não permite a coleta",
  opt_out: "Pedido do veículo",
  legal: "Jurídico",
  quality: "Qualidade",
  other: "Outro motivo",
};

export const LAYER_TEXT: Record<1 | 2 | 3 | 4, string> = {
  1: "Oficial",
  2: "Portal local",
  3: "Temático/Regional",
  4: "Nacional",
};

export const PRIORITY_TEXT: Record<1 | 2 | 3, string> = { 1: "Alta", 2: "Normal", 3: "Baixa" };

export const IMAGE_POLICY_TEXT: Record<ImagePolicy, string> = {
  none: "Nenhuma imagem",
  licensed_only: "Só licenciadas",
  with_agreement: "Com acordo",
  reproduction: "Reprodução",
};

export const REPUBLISH_POLICY_TEXT: Record<RepublishPolicy, string> = {
  link_only: "Só link",
  summary_2_sentences: "Resumo de até 2 frases",
};

export const RELIABILITY_TEXT: Record<Reliability, string> = {
  low: "Baixa",
  standard: "Padrão",
  verified: "Verificada",
  primary: "Primária",
};

export const HEALTH_TEXT: Record<HealthLabel, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  critica: "Crítica",
  sem_dados: "Sem dados",
};

/** Campo crítico (nome da coluna) em linguagem da redação: banner e diálogo de aprovação. */
export const CRITICAL_FIELD_TEXT: Record<string, string> = {
  image_policy: "política de imagem",
  republish_policy: "política de republicação",
  reliability: "confiabilidade",
  may_be_sole_source: "fonte única",
  status: "desbloqueio",
};

/** Valor de um campo crítico em linguagem da redação ("reprodução", "sim"). */
export function criticalValueText(field: string, value: string): string {
  if (field === "image_policy" && value in IMAGE_POLICY_TEXT)
    return IMAGE_POLICY_TEXT[value as ImagePolicy].toLowerCase();
  if (field === "republish_policy" && value in REPUBLISH_POLICY_TEXT)
    return REPUBLISH_POLICY_TEXT[value as RepublishPolicy].toLowerCase();
  if (field === "reliability" && value in RELIABILITY_TEXT)
    return RELIABILITY_TEXT[value as Reliability].toLowerCase();
  if (field === "may_be_sole_source") return value === "true" ? "sim" : "não";
  if (field === "status") return "pausada";
  return value;
}

const clockFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Cuiaba",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "14:32" no fuso de Cuiabá (hora de relógio usada no painel). */
export function clockTime(at: Date | string): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return Number.isNaN(d.getTime()) ? "" : clockFormatter.format(d);
}

/** "10 min", "1 h", "1 h 30", "24 h". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m}`;
}

export interface FrequencyOption {
  value: string;
  label: string;
}

/** Grade do ciclo normal (múltiplos de 30 min, de 30 min a 24 h — mesma grade do banco, D-F14). */
export const NORMAL_FREQUENCY_GRID: readonly number[] = Array.from(
  { length: 48 },
  (_, i) => (i + 1) * 30,
);

/**
 * Opções de frequência para `<select>`, com o rótulo único de `formatMinutes` (achado da revisão
 * FS-T7 fix round 1: `CollectionSettingsDialog` e a lista tinham cada uma a sua própria grade).
 */
export const normalFrequencyOptions = (): FrequencyOption[] =>
  NORMAL_FREQUENCY_GRID.map((m) => ({ value: String(m), label: formatMinutes(m) }));

export const fastFrequencyOptions = (): FrequencyOption[] =>
  FAST_FREQUENCIES.map((m) => ({ value: String(m), label: formatMinutes(m) }));

export const FREQUENCY_TEXT = {
  default: "padrão",
  fast: "via rápida",
  raisedBy: { robots: "robots", terms: "termos" } as const,
  separator: " · ",
  next: (time: string) => `Próxima coleta ${time}`,
  noNext: "Sem coleta prevista",
} as const;

/** "4 de 5". */
export const scoreText = (score: number): string => `${score} de 5`;

export const APPROVAL_ERROR_TEXT = {
  self_approval: "A aprovação precisa ser de outra pessoa",
  forbidden: "Só admin ou editor-chefe aprova mudança crítica.",
  not_pending: "Este pedido já foi decidido.",
  invalid: "Justificativa obrigatória.",
} as const;

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const SOURCE_ACTION_TEXT = {
  saved: "Alterações salvas",
  nothingToSave: "Nenhuma alteração para salvar",
  pendingApproval: (n: number) =>
    `${n} ${plural(n, "alteração aguarda", "alterações aguardam")} segunda aprovação`,
  savedWithPending: (n: number) =>
    `Alterações salvas. ${n} ${plural(n, "alteração aguarda", "alterações aguardam")} segunda aprovação`,
  conflict: (who: string, time: string) =>
    `Esta fonte foi alterada por ${who} às ${time}. Recarregue para ver a versão atual.`,
  conflictUnknown: "Esta fonte foi alterada por outra pessoa. Recarregue para ver a versão atual.",
  systemActor: "o sistema",
  auditFailed: "Aviso: a alteração foi feita, mas o registro complementar na auditoria falhou.",
  approvalRequestFailed: (fields: string) =>
    `Não foi possível pedir a segunda aprovação para: ${fields}. Nada foi pedido para esse campo; tente de novo.`,
  createdFollowUpFailed:
    "Não foi possível registrar a revisão dos termos. Marque de novo na aba Configuração.",
  forbidden: "Sua conta não tem permissão para esta ação.",
  notFound: "Fonte não encontrada.",
  invalid: "Revise os campos destacados.",
  unavailable: "Não foi possível concluir agora. Tente de novo em instantes.",
  rateLimited: "Você fez muitas ações na última hora. Tente de novo mais tarde.",
  fastLaneFull: (used: number, max: number) =>
    `A via rápida está cheia: ${used} de ${max} fontes. Tire outra fonte da via rápida ou peça para aumentar o limite.`,
  fastLaneInactive: "Ative a fonte antes de colocá-la na via rápida.",
  justificationRequired:
    "Explique por que esta mudança é necessária. A segunda pessoa vai ler antes de aprovar.",
  reasonRequired: "Informe o motivo.",
  confirmName: "Digite o nome da fonte exatamente como aparece para confirmar.",
  created: "Fonte salva pausada. Ative quando os termos estiverem revisados e o teste passar.",
  createdActive: "Fonte salva e ativada.",
  createdNotActivated: (why: string) => `Fonte salva pausada. Não foi possível ativar: ${why}`,
  termsRequired: "Revise os termos de uso antes de ativar.",
  status: {
    pause: "Fonte pausada",
    resume: "Fonte retomada",
    activate: "Fonte ativada",
    block: "Fonte bloqueada",
    blockOptOut: (n: number) =>
      `Fonte bloqueada a pedido do veículo. ${n} ${plural(n, "reprodução removida", "reproduções removidas")}.`,
    unblockRequested: "O desbloqueio aguarda segunda aprovação",
    blockOptOutTakedownFailed:
      "Fonte bloqueada, mas a remoção das reproduções falhou. Bloqueie de novo com “Pedido do veículo” para repetir a remoção: o prazo é de 24 h.",
    archive: "Fonte excluída (arquivada). Itens e matérias continuam íntegros.",
    restore: "Fonte restaurada. Ela volta pausada.",
  },
  invalidTransition: {
    pause: "Só uma fonte ativa ou com falhas pode ser pausada.",
    resume: "Só uma fonte pausada pode ser retomada.",
    activate: "Só uma fonte pausada pode ser ativada.",
    block: "Esta fonte não pode ser bloqueada agora.",
    unblock: "Só uma fonte bloqueada pode ser desbloqueada.",
    archive: "Arquivar exige que a fonte esteja pausada ou bloqueada.",
    restore: "Esta fonte não está arquivada.",
  },
  collectNow: {
    queued: "Coleta enfileirada. Acompanhe em Coleta e teste.",
    notActive: "Só fontes ativas ou com falhas podem ser coletadas agora.",
    rateLimited:
      "Aguarde: cada fonte pode ser coletada agora uma vez a cada 5 minutos, e cada pessoa 20 vezes por hora.",
  },
  bulk: {
    tooMany: "Selecione até 50 fontes por vez.",
    empty: "Selecione ao menos uma fonte.",
    done: {
      pause: (n: number) => `${n} ${plural(n, "pausada", "pausadas")}`,
      activate: (n: number) => `${n} ${plural(n, "ativada", "ativadas")}`,
      frequency: (n: number) => `${n} com a frequência nova`,
      frequencyFast: (n: number) => `${n} na via rápida`,
    },
    ignored: (n: number) => `${n} ${plural(n, "ignorada", "ignoradas")}`,
    reasons: {
      alreadyPaused: "já estava pausada",
      notActive: "não está ativa",
      notPaused: "não está pausada",
      notActivated: "ainda não passou pela ativação (feed e termos revisados)",
      blocked: "está bloqueada",
      archived: "está arquivada",
      fastLaneFull: "via rápida cheia",
      notFound: "fonte não encontrada",
      failed: "não foi possível aplicar",
    },
  },
  defaultFrequency: {
    saved: "Frequência padrão salva",
    invalid: "O padrão aceita só múltiplos de 30 minutos, de 30 min a 24 h.",
  },
  fastLaneMax: {
    saved: "Vagas da via rápida salvas",
    invalid: "Vagas da via rápida: um número inteiro de 0 a 20.",
  },
  logo: {
    saved: "Logotipo salvo",
    missing: "Escolha um arquivo de imagem.",
    type: "Envie PNG ou WebP. SVG não é aceito.",
    size: "O logotipo deve ter até 200 KB.",
    square: "O logotipo deve ser quadrado (mesma largura e altura).",
    small: "O logotipo deve ter pelo menos 96 px de lado.",
    unreadable: "Não foi possível ler a imagem.",
    unavailable: "O armazenamento de logotipos não está disponível agora.",
  },
  approval: {
    approved: "Mudança aprovada e aplicada",
    rejected: "Pedido recusado",
    obsolete:
      "O campo mudou depois do pedido. O pedido foi recusado automaticamente como obsoleto.",
    obsoleteReason: "Obsoleto: o campo mudou depois do pedido.",
    notApplied: "Aprovado, mas não foi possível aplicar agora. Tente aprovar de novo.",
  },
  test: {
    rateLimited: "Você testou muitas conexões na última hora. Tente de novo mais tarde.",
  },
} as const;

export const ANALYZE_TEXT = {
  done: "Análise concluída",
  duplicate: (name: string) => `Esta fonte já está cadastrada: ${name}`,
  duplicateArchived: "Existe uma fonte arquivada para este endereço. Restaurar?",
  errors: {
    invalid: "Use um endereço como https://www.exemplo.com.br/cidades",
    scheme: "Use um endereço que comece com http:// ou https://, como https://www.exemplo.com.br",
    credentials: "Tire usuário e senha do endereço, como em https://www.exemplo.com.br/cidades",
    port: "Use o endereço sem porta, como https://www.exemplo.com.br/cidades",
    too_long: "Endereço longo demais. Use o endereço da home, da seção ou do feed.",
    forbidden_host: "Este endereço não é permitido.",
    robots_disallowed: (host: string, path: string) =>
      `O robots.txt de ${host} não permite a coleta de ${path}. A fonte não pode ser cadastrada para coleta.`,
    robots_unavailable:
      "Não conseguimos ler o robots.txt deste site agora. Tente de novo em alguns minutos.",
    nothing_found:
      "Não encontramos feed nem lista de notícias neste endereço. Tente o endereço de uma seção ou do feed.",
    rate_limited: (minutes: number) =>
      `Você fez muitas análises na última hora. Tente de novo em ${minutes} min.`,
    host_rate_limited:
      "Este site recebeu muitas análises na última hora. Tente de novo mais tarde.",
    unreachable: "O site não respondeu. Confira o endereço e tente de novo.",
    disabled: "A análise por link está desligada agora. Cadastre a fonte preenchendo os campos.",
  },
  aiUnavailable: "Sugestões da IA indisponíveis agora. Preencha os campos manualmente.",
} as const;

const fullDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Cuiaba",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "27/09 14:32" no fuso de Cuiabá (colunas de data da lista e do histórico). */
export function fullDateTime(at: string): string {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : fullDateTimeFormatter.format(d);
}

const listPlural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Textos da tela O03 (lista de fontes), spec §8. */
export const SOURCES_LIST_TEXT = {
  title: "Fontes",
  addSource: "Adicionar fonte",
  collectionSettings: "Configurações da coleta",
  fastLane: (used: number, max: number) => `Via rápida: ${used} de ${max}`,
  never: "Nunca",
  search: { label: "Buscar", placeholder: "Nome ou domínio" },
  filters: {
    status: "Status",
    statusAll: "Todos os status",
    layer: "Camada",
    layerAll: "Todas as camadas",
    locality: "Localidade",
    localityAll: "Todas as localidades",
    health: "Saúde",
    healthAll: "Todas",
    via: "Via",
    viaAll: "Todas",
    viaFast: "Rápida",
    viaNormal: "Normal",
    pending: "Só com aprovação pendente",
    submit: "Filtrar",
    clear: "Limpar filtros",
  },
  columns: {
    selectAll: "Selecionar todas",
    selectOne: (name: string) => `Selecionar ${name}`,
    source: "Fonte",
    status: "Status",
    layer: "Camada",
    locality: "Localidade",
    score: "Score",
    priority: "Prioridade",
    frequency: "Frequência",
    health: "Saúde",
    lastFetch: "Última coleta",
    nextFetch: "Próxima coleta",
    errors: "Erros 24 h",
    actions: "Ações",
  },
  rowActions: {
    open: "Abrir",
    collectNow: "Coletar agora",
    pause: "Pausar",
    resume: "Retomar",
    menuFor: (name: string) => `Ações de ${name}`,
  },
  bulk: {
    selected: (n: number) => `${n} ${listPlural(n, "fonte selecionada", "fontes selecionadas")}`,
    clear: "Limpar seleção",
    pause: "Pausar",
    activate: "Ativar",
    frequencyButton: "Mudar frequência",
    pauseDialogTitle: (n: number) => `Pausar ${n} ${listPlural(n, "fonte", "fontes")}?`,
    pauseDialogBody: "As fontes selecionadas param de ser coletadas até você retomá-las.",
    pauseDialogConfirm: (n: number) => `Pausar ${n} ${listPlural(n, "fonte", "fontes")}`,
    cancel: "Cancelar",
  },
  /** Diálogo de frequência em lote (wireframe Lote.dc.html, spec §7.6). */
  bulkFrequency: {
    title: (n: number) => `Mudar frequência de ${n} ${listPlural(n, "fonte", "fontes")}`,
    legend: "Nova frequência",
    followDefault: (label: string) => `Seguir o padrão global (${label})`,
    fastLane: "Via rápida:",
    fastLaneSelectLabel: "Intervalo da via rápida",
    normalCycle: "Ciclo normal:",
    normalSelectLabel: "Intervalo do ciclo normal",
    predicted: (n: number, label: string) =>
      `Resultado previsto: ${n} ${listPlural(n, "fonte passa", "fontes passam")} a ${label}.`,
    predictedIgnored: (n: number) =>
      ` ${n} ${listPlural(n, "seria ignorada", "seriam ignoradas")}: via rápida cheia.`,
    reasonLabel: "Motivo (vai para a auditoria)",
    reasonRequired: "Explique o motivo desta mudança em lote.",
    cancel: "Cancelar",
    confirm: (n: number) => `Aplicar às ${n} ${listPlural(n, "fonte", "fontes")}`,
  },
  empty: {
    noneTitle: "Nenhuma fonte cadastrada ainda.",
    filteredTitle: "Nenhuma fonte com esses filtros.",
  },
  error: {
    title: "Não foi possível carregar as fontes.",
    retry: "Tentar de novo",
  },
  pagination: {
    prev: "Página anterior",
    next: "Próxima página",
    of: (page: number, total: number) => `Página ${page} de ${total}`,
  },
  settings: {
    trigger: "Configurações da coleta",
    title: "Configurações da coleta",
    defaultFrequencyLabel: "Frequência padrão",
    fastLaneMaxLabel: "Vagas da via rápida",
    fastLaneMaxHint: (used: number, max: number) => `Via rápida: ${used} de ${max}`,
    save: "Salvar",
    close: "Fechar",
  },
  approvalsNotice: {
    one: "1 mudança aguarda segunda aprovação.",
    many: (n: number) => `${n} mudanças aguardam segunda aprovação.`,
    review: "Revisar",
  },
  /** Aviso de fontes rápidas puladas por falta de vaga (spec §8, cabeçalho O03). */
  fastLaneSkipped: {
    titleOne: (name: string) => `${name} não coletou pela via rápida nos últimos 30 min: sem vaga.`,
    title: (names: string) =>
      `${names} não coletaram pela via rápida nos últimos 30 min: sem vaga.`,
    settingsLink: "Configurações da coleta",
  },
  toast: {
    undo: "Desfazer",
  },
} as const;
