import type { AnalyzeError, AiStatus } from "@/lib/sources/analyze";
import type {
  ImagePolicy,
  Locality,
  Reliability,
  RepublishPolicy,
  SourceLayer,
  SourceStatus,
  StatusReason,
} from "@/lib/sources/types";

/** Textos do painel de fontes (Control Center · Fontes; P5-T4/FS-T6). */

export const SOURCE_STATUS_LABEL: Record<SourceStatus, string> = {
  active: "Ativa",
  paused: "Pausada",
  degraded: "Instável",
  blocked: "Bloqueada",
};

/** Status como texto para leitor de tela e tooltip; o rótulo nunca depende só de cor. */
export const SOURCE_STATUS_HINT: Record<SourceStatus, string> = {
  active: "Coletando normalmente",
  paused: "Não está sendo coletada",
  degraded: "Coletando com falhas recentes",
  blocked: "Bloqueada: não coleta até alguém desbloquear",
};

export const STATUS_REASON_LABEL: Record<StatusReason, string> = {
  pending_activation: "Aguardando ativação",
  manual: "Pausa manual",
  auto_failures: "Pausa automática por falhas",
  robots: "Robots.txt não permite",
  opt_out: "A fonte pediu para sair",
  legal: "Questão jurídica",
  quality: "Qualidade insuficiente",
  other: "Outro motivo",
};

/** Motivos que a pessoa escolhe ao bloquear. */
export const BLOCK_REASONS: readonly StatusReason[] = [
  "opt_out",
  "robots",
  "legal",
  "quality",
  "other",
];

export const LAYER_LABEL: Record<SourceLayer, string> = {
  1: "Camada 1 · Oficial",
  2: "Camada 2 · Portal local",
  3: "Camada 3 · Temático ou regional",
  4: "Camada 4 · Nacional",
};

export const IMAGE_POLICY_LABEL: Record<ImagePolicy, string> = {
  none: "Sem imagens",
  licensed_only: "Só imagem licenciada",
  with_agreement: "Com acordo",
  reproduction: "Reprodução com crédito",
};

export const REPUBLISH_POLICY_LABEL: Record<RepublishPolicy, string> = {
  link_only: "Só link para o original",
  summary_2_sentences: "Resumo de até 2 frases",
};

export const RELIABILITY_LABEL: Record<Reliability, string> = {
  primary: "Fonte primária",
  verified: "Verificada",
  standard: "Padrão",
  low: "Baixa",
};

export const LOCALITY_LABEL: Record<Locality, string> = {
  cuiaba: "Cuiabá",
  "varzea-grande": "Várzea Grande",
  mt: "Mato Grosso",
  nacional: "Nacional",
};

export const PRIORITY_LABEL: Record<1 | 2 | 3, string> = { 1: "Alta", 2: "Normal", 3: "Baixa" };

export const HEALTH_LABEL = {
  saudavel: "Saudável",
  atencao: "Atenção",
  critica: "Crítica",
  sem_dados: "Sem dados",
} as const;

/** Campo crítico por extenso (mensagens de aprovação e histórico). */
export const CRITICAL_FIELD_LABEL: Record<string, string> = {
  imagePolicy: "Política de imagem",
  republishPolicy: "Política de republicação",
  reliability: "Confiabilidade",
  maySoleSource: "Pode ser fonte única",
  status: "Desbloqueio",
  image_policy: "Política de imagem",
  republish_policy: "Política de republicação",
  may_be_sole_source: "Pode ser fonte única",
};

/** Rótulos da frequência (`FrequencyLabel`). */
export const FREQUENCY_TEXT = {
  default: (min: number) => `${durationLabel(min)} · padrão`,
  chosen: (min: number) => durationLabel(min),
  fast: (min: number, raisedBy: "robots" | "terms" | null) =>
    `${min} min · via rápida${raisedBy ? ` (${raisedBy === "robots" ? "robots" : "termos"})` : ""}`,
  raised: (min: number, raisedBy: "robots" | "terms") =>
    `${durationLabel(min)} (${raisedBy === "robots" ? "robots" : "termos"})`,
  next: (hhmm: string) => `Próxima coleta ${hhmm}`,
  noNext: "Sem coleta prevista",
  raisedByRobots: "Elevada pelo Crawl-delay do robots.txt da fonte",
  raisedByTerms: "Elevada pelo intervalo mínimo dos termos de uso da fonte",
} as const;

export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  if (min % 60 === 0) return `${min / 60} h`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export const EDITORIAL_SCORE_TEXT = (score: number) => `${score} de 5`;

/** Mensagens das Server Actions do painel. */
export const SOURCE_MESSAGES = {
  forbidden: "Seu papel não permite gerir fontes.",
  invalid: "Confira os campos destacados.",
  notFound: "Fonte não encontrada.",
  saved: "Fonte salva.",
  created: "Fonte criada. Ela entra pausada, aguardando ativação.",
  noChanges: "Nada mudou.",
  approvalPending: (n: number) =>
    n === 1
      ? "1 alteração aguarda segunda aprovação"
      : `${n} alterações aguardam segunda aprovação`,
  savedWithApproval: (n: number) =>
    `Fonte salva. ${
      n === 1
        ? "1 alteração aguarda segunda aprovação"
        : `${n} alterações aguardam segunda aprovação`
    }`,
  justificationRequired: "Explique por que a alteração é necessária.",
  conflict: (who: string, hhmm: string) =>
    `Esta fonte foi alterada por ${who} às ${hhmm}. Recarregue para ver a versão atual.`,
  conflictUnknown: "Esta fonte foi alterada por outra pessoa. Recarregue para ver a versão atual.",
  fastLaneFull: (used: number, max: number) =>
    `A via rápida está cheia: ${used} de ${max} fontes. Tire uma fonte da via rápida ou aumente o limite.`,
  fastLaneInactive: "Ative a fonte antes de colocá-la na via rápida.",
  needsApproval: "Esta mudança amplia direitos da fonte e precisa de aprovação de outra pessoa.",
  duplicateSlug: "Já existe uma fonte com este identificador.",
  rateLimited: "Você fez muitas tentativas. Tente de novo mais tarde.",
  statusDone: {
    activate: "Fonte ativada.",
    resume: "Fonte reativada.",
    pause: "Fonte pausada.",
    block: "Fonte bloqueada.",
    unblock: "Fonte desbloqueada e pausada.",
    archive: "Fonte excluída (arquivada). Itens e matérias foram mantidos.",
    restore: "Fonte restaurada. Ela volta pausada.",
  },
  optOutDone: (n: number) =>
    n === 0
      ? "Fonte bloqueada por pedido da fonte. Não havia imagens reproduzidas."
      : `Fonte bloqueada por pedido da fonte. ${n} ${n === 1 ? "imagem reproduzida foi removida" : "imagens reproduzidas foram removidas"}.`,
  /** `n` < 0: falha sem contagem (erro antes de listar as imagens). */
  optOutIncomplete: (n: number) =>
    n > 0
      ? `Fonte bloqueada, mas ${n} ${n === 1 ? "imagem não foi removida" : "imagens não foram removidas"}; repita a ação.`
      : "Fonte bloqueada, mas as imagens reproduzidas não foram removidas; repita a ação.",
  reasonRequired: "Informe o motivo.",
  mustPauseFirst: "Pause a fonte antes de excluir.",
  invalidTransition: "Esta ação não vale para o estado atual da fonte.",
  archived: "A fonte está arquivada. Restaure antes de alterar.",
  activationBlocked: {
    termsNotReviewed: "Marque os termos de uso da fonte como revisados antes de ativar.",
    noAddress: "Informe o endereço de coleta da fonte antes de ativar.",
    robots: "O robots.txt da fonte não permite a coleta. A fonte não pode ser ativada.",
    connection: (why: string) => `O teste de conexão falhou: ${why}`,
  },
  connection: (items: number) => `Conexão ok: ${items} ${items === 1 ? "item" : "itens"}.`,
  collectNow: {
    started: "Coleta iniciada. Os itens aparecem em instantes.",
    notActive: "Só fontes ativas ou instáveis podem ser coletadas agora.",
    rateLimited: "Esta fonte já foi coletada há pouco ou você atingiu o limite por hora.",
    notFound: "Fonte não encontrada.",
  },
  bulk: {
    tooMany: "O lote aceita de 1 a 50 fontes.",
    done: (applied: number, skipped: number) =>
      skipped === 0
        ? `${applied} ${applied === 1 ? "fonte alterada" : "fontes alteradas"}.`
        : `${applied} ${applied === 1 ? "fonte alterada" : "fontes alteradas"}, ${skipped} ${skipped === 1 ? "ignorada" : "ignoradas"} com motivo.`,
    reason: {
      not_found: "Fonte não encontrada",
      archived: "Fonte arquivada",
      blocked: "Fonte bloqueada",
      already_paused: "Já estava pausada",
      already_active: "Já estava ativa",
      not_activated: "Falta revisar os termos ou informar o endereço de coleta",
      needs_first_activation: "A primeira ativação exige o teste de conexão: ative individualmente",
      unchanged: "Já tinha essa frequência",
      fast_lane_full: "A via rápida está cheia",
      not_active: "Ative a fonte antes de colocá-la na via rápida",
      needs_approval: "Precisa de aprovação de outra pessoa",
      error: "Não foi possível alterar",
    } as Record<string, string>,
  },
  approval: {
    approved: "Aprovação registrada e mudança aplicada.",
    rejected: "Recusa registrada. A fonte não mudou.",
    forbidden: "Apenas administração e editor-chefe aprovam mudanças críticas de fonte.",
    notCritical: "Este pedido não é de uma mudança crítica de fonte.",
  },
  defaultFrequency: {
    saved: (min: number) => `Frequência padrão: ${durationLabel(min)}.`,
    invalid: "O padrão precisa ser múltiplo de 30 minutos, de 30 minutos a 24 horas.",
  },
  fastLaneMax: {
    saved: (n: number) => `A via rápida comporta ${n} ${n === 1 ? "fonte" : "fontes"}.`,
    invalid: "Informe de 0 a 20 vagas.",
    belowUsed: (used: number) =>
      `${used} ${used === 1 ? "fonte já usa" : "fontes já usam"} a via rápida. O limite novo vale só para novas entradas.`,
  },
  logo: {
    saved: "Logo salvo.",
    missing: "Escolha um arquivo PNG ou WebP.",
    type: "Use PNG ou WebP. SVG não é aceito.",
    size: "O logo pode ter até 200 KB.",
    square: "O logo precisa ser quadrado.",
    small: "O logo precisa ter pelo menos 96 por 96 pixels.",
    unreadable: "Não foi possível ler as dimensões da imagem.",
    storage: "Não foi possível guardar o logo agora. Tente de novo.",
  },
  analyze: {
    ok: "Análise pronta.",
    duplicate: "Esta fonte já está cadastrada.",
    aiStatus: {
      ok: "Sugestões da IA prontas.",
      disabled: "A IA está desligada. Preencha os campos à mão.",
      unavailable: "A IA não respondeu agora. Preencha os campos à mão.",
      insufficient_data: "Poucos itens para a IA sugerir. Preencha os campos à mão.",
      skipped: "",
    } as Record<AiStatus, string>,
  },
  unexpected: "Não foi possível concluir agora. Nada foi alterado. Tente de novo.",
} as const;

/** Erros da análise de link (`AnalyzeError`) em pt-BR. */
export const ANALYZE_ERROR_TEXT: Record<AnalyzeError, string> = {
  invalid: "Este endereço não parece válido. Confira o link.",
  scheme: "Use um endereço que comece com http ou https.",
  credentials: "O endereço não pode ter usuário e senha.",
  port: "O endereço não pode usar porta diferente da padrão.",
  too_long: "O endereço é longo demais.",
  forbidden_host: "Este endereço não é permitido.",
  robots_disallowed: "O robots.txt do site não permite a coleta. A fonte não pode ser cadastrada.",
  robots_unavailable: "Não foi possível ler o robots.txt do site. Tente de novo mais tarde.",
  nothing_found:
    "Não encontramos feed, sitemap de notícias nem lista de matérias neste endereço. Informe o endereço do feed à mão.",
  rate_limited: "Limite de requisições a este site atingido. Tente de novo mais tarde.",
  unreachable: "O site não respondeu. Confira o link e tente de novo.",
  disabled: "A análise de link está desligada. Cadastre a fonte informando o endereço do feed.",
};
