import type { ImagePolicy, Reliability, RepublishPolicy } from "@/lib/sources/types";
import {
  IMAGE_POLICY_LABEL,
  LOCALITY_LABEL,
  PRIORITY_LABEL,
  RELIABILITY_LABEL,
  REPUBLISH_POLICY_LABEL,
  SOURCE_STATUS_LABEL,
  STATUS_REASON_LABEL,
  durationLabel,
} from "./sources-admin";

/** Textos das telas Nova fonte (O04a) e Fonte (O04): assistente, seções, diálogos e tabelas (FS-T8). */

export const SECTION_NAV = {
  label: "Seções da fonte",
  items: [
    { key: "resumo", label: "Resumo e saúde", path: "" },
    { key: "configuracao", label: "Configuração", path: "/configuracao" },
    { key: "coleta", label: "Coleta e teste", path: "/coleta" },
    { key: "recomendacao", label: "Recomendação", path: "/recomendacao" },
    { key: "historico", label: "Histórico", path: "/historico" },
    { key: "itens", label: "Itens", path: "/itens" },
  ],
} as const;

export const DETAIL = {
  back: "Voltar para fontes",
  title: (name: string) => `${name} · Fontes · Estúdio · CityNews Cuiabá`,
  openSite: (name: string) => `Abrir o site de ${name} (abre em outra aba)`,
  archivedTitle: "Fonte excluída (arquivada)",
  archivedBody:
    "A fonte está em modo de leitura. Itens coletados, agregados já exibidos e matérias que a citam continuam íntegros. Restaure a fonte para voltar a editá-la.",
  version: (n: number) => `Versão ${n}`,
  statusSince: (when: string) => `desde ${when}`,
  autoPaused: (when: string, failures: number) =>
    `Pausada automaticamente em ${when} após ${failures} ${failures === 1 ? "falha seguida" : "falhas seguidas"}`,
  lastError: "Último erro",
  noError: "Nenhum erro registrado",
  pendingTitle: "Aguardando segunda aprovação",
  notFoundTitle: "Fonte não encontrada",
  notFoundBody:
    "Este endereço não corresponde a nenhuma fonte cadastrada. Ela pode ter sido removida ou o link estar errado.",
  backToList: "Ver todas as fontes",
  errorTitle: "Não foi possível carregar a fonte.",
  errorBody: "Nada foi alterado. Tente de novo em instantes.",
  retry: "Tentar de novo",
  loading: "Carregando a fonte",
  sectionError: "Não foi possível carregar esta seção. As outras seções seguem disponíveis.",
} as const;

export const ACTIONS = {
  collectNow: "Coletar agora",
  collecting: "Coletando…",
  pause: "Pausar",
  resume: "Retomar",
  activate: "Ativar",
  block: "Bloquear",
  unblock: "Pedir desbloqueio",
  remove: "Excluir fonte",
  restore: "Restaurar fonte",
  removeNeedsPause: "Pause a fonte antes de excluir.",
  working: "Aguarde…",
  reload: "Recarregar",
  reloadHint: "Recarregue para ver a versão atual. O que você digitou não foi salvo.",
  cancel: "Cancelar",
  close: "Fechar",
} as const;

export const BLOCK_DIALOG = {
  title: "Bloquear fonte",
  intro:
    "Uma fonte bloqueada deixa de ser coletada e seus agregados somem do portal. Para desbloquear, outra pessoa precisa aprovar.",
  reasonLegend: "Motivo do bloqueio",
  reasons: {
    opt_out: {
      label: "Pedido do veículo",
      hint: "Remove as imagens reproduzidas e zera a política de imagem da fonte.",
    },
    robots: { label: "Robots.txt não permite", hint: "O site passou a proibir a coleta." },
    legal: { label: "Jurídico", hint: "Questão jurídica em análise." },
    quality: { label: "Qualidade", hint: "Conteúdo abaixo do padrão editorial." },
    other: { label: "Outro motivo", hint: "Registrado como outro motivo." },
  },
  submit: "Bloquear fonte",
  unblockTitle: "Pedir desbloqueio",
  unblockIntro:
    "Desbloquear amplia os direitos da fonte e precisa da aprovação de outra pessoa. A fonte volta pausada.",
  justification: "Por que desbloquear?",
  justificationHint: "Explique o que mudou. Quem aprova lê este texto.",
  unblockSubmit: "Pedir desbloqueio",
} as const;

export const REMOVE_DIALOG = {
  title: "Excluir fonte",
  intro: (name: string) =>
    `${name} será arquivada: sai da lista padrão, da coleta e das listas de recomendação. Itens coletados, agregados já exibidos e matérias que a citam continuam íntegros. Dá para restaurar depois, no filtro Arquivadas.`,
  reasonLabel: "Motivo da exclusão",
  reasonHint: "Obrigatório. Fica no histórico da fonte.",
  confirmLabel: (name: string) => `Digite ${name} para confirmar`,
  confirmHint: "A confirmação precisa ser idêntica ao nome da fonte.",
  submit: "Excluir fonte",
  mustPause: "Pause a fonte antes de excluir.",
} as const;

export const APPROVE_DIALOG = {
  openLabel: "Ver pedido",
  title: "Mudança crítica aguardando aprovação",
  requestedBy: (who: string, when: string) => `Pedido por ${who} em ${when}`,
  unknownPerson: "uma pessoa da equipe",
  justification: "Justificativa do pedido",
  diffLegend: "O que muda",
  from: "Antes",
  to: "Depois",
  approve: "Aprovar e aplicar",
  reject: "Recusar",
  rejectHint: "A recusa fica na auditoria, com quem recusou. O motivo digitado não é guardado.",
  requester:
    "A aprovação precisa ser de outra pessoa. Peça a alguém da administração ou do editor-chefe.",
  observer:
    "Seu papel não aprova mudanças críticas de fonte. Apenas administração e editor-chefe aprovam.",
  banner: (what: string, who: string) => `Aguardando segunda aprovação: ${what}, pedido por ${who}`,
  effectNote: "Ao aprovar, a mudança é aplicada na hora e as duas pessoas ficam na auditoria.",
} as const;

/** Como o campo crítico e seu valor aparecem nos pedidos. */
export const CRITICAL_FIELD_TEXT: Record<string, string> = {
  image_policy: "Política de imagem",
  republish_policy: "Política de republicação",
  reliability: "Confiabilidade",
  may_be_sole_source: "Pode ser fonte única",
  status: "Estado da fonte",
};

export function criticalValueText(field: string, value: string): string {
  switch (field) {
    case "image_policy":
      return IMAGE_POLICY_LABEL[value as ImagePolicy] ?? value;
    case "republish_policy":
      return REPUBLISH_POLICY_LABEL[value as RepublishPolicy] ?? value;
    case "reliability":
      return RELIABILITY_LABEL[value as Reliability] ?? value;
    case "may_be_sole_source":
      return value === "true" ? "Sim" : "Não";
    case "status":
      return value === "paused" ? "Pausada (desbloqueada)" : value;
    default:
      return value;
  }
}

export const WIZARD = {
  title: "Adicionar fonte",
  intro:
    "Cole o endereço da home, de uma seção ou do feed. O CityNews procura o feed, mostra os últimos itens e sugere os ajustes. Nada é aplicado sem o seu clique.",
  stepsLabel: "Passos do cadastro",
  steps: ["Endereço", "Análise", "Revisão", "Termos", "Salvar"],
  urlLabel: "Endereço da fonte",
  urlHint: "Exemplo: https://www.exemplo.com.br/cidades",
  analyze: "Analisar",
  analyzing: "Analisando…",
  reanalyze: "Analisar outro endereço",
  back: "Voltar",
  next: "Continuar",
  duplicate: (name: string) => `Esta fonte já está cadastrada: ${name}`,
  duplicateArchived: (name: string) =>
    `Existe uma fonte arquivada para este endereço: ${name}. Restaure para voltar a usá-la.`,
  openExisting: "Abrir a fonte",
  restoreExisting: "Abrir para restaurar",
  robotsBlocked: (host: string, path: string) =>
    `O robots.txt de ${host} não permite a coleta de ${path}. A fonte não pode ser cadastrada para coleta.`,
  errorTitle: "Não foi possível analisar o endereço",
  aiUnavailableTitle: "Sugestões da IA indisponíveis agora",
  aiUnavailable: "Sugestões da IA indisponíveis agora. Preencha os campos manualmente.",
  previewTitle: "Prévia dos últimos itens",
  previewListLabel: "Prévia dos últimos itens",
  previewNote:
    "Só título, data e link para o original. Nenhuma imagem nem texto da matéria é carregado.",
  previewEmpty: "Nenhum item com título foi encontrado neste endereço.",
  dropped: (n: number) =>
    n === 1
      ? "1 item descartado por conter instruções"
      : `${n} itens descartados por conter instruções`,
  qualityTitle: "Alertas de qualidade sugeridos pela IA",
  qualityNone: "A IA não apontou alertas de qualidade.",
  rationaleTitle: "Por que a IA sugeriu isso",
  selectorsTitle: "Seletores de página sugeridos pela IA",
  selectorsUse: (n: number) =>
    `Usar os seletores sugeridos (extraem ${n} ${n === 1 ? "item" : "itens"} da página)`,
  selectorsNote:
    "Sem os seletores, a página é coletada como página única. Só aparecem seletores que extraem pelo menos 3 itens.",
  backToReview: "Voltar para a revisão",
  fieldErrorsNote: "Alguns campos precisam de ajuste. Volte à revisão para corrigi-los.",
  reviewTitle: "Revise e ajuste",
  reviewIntro:
    "As sugestões da IA só entram no formulário quando você clica em usar. As sugestões automáticas já vêm preenchidas e podem ser editadas.",
  strategy: "Como coletamos",
  strategyValue: {
    rss: "Feed RSS",
    atom: "Feed Atom",
    jsonfeed: "JSON Feed",
    sitemap_news: "Sitemap de notícias",
    page_list: "Lista de matérias da página",
    page_article: "Página única",
  } as Record<string, string>,
  howWeFound: "Como descobrimos",
  triedOutcome: {
    ok: "funcionou",
    not_feed: "não é feed",
    not_found: "não encontrado",
    empty: "sem itens",
    failed: "falhou",
    skipped: "não testado",
  } as Record<string, string>,
  termsTitle: "Termos de uso e robots.txt",
  termsIntro:
    "Leia os termos de uso da fonte antes de ativar. A coleta só é ativada com o robots.txt permitindo e os termos revisados.",
  termsFound: "Links de termos encontrados no site",
  termsNone: "Nenhum link de termos foi encontrado. Cole o endereço dos termos abaixo, se houver.",
  termsReviewed: "Li os termos de uso e a coleta é permitida",
  robotsOk: (delay: number | null) =>
    delay === null
      ? "O robots.txt permite a coleta."
      : `O robots.txt permite a coleta e pede intervalo de ${delay} s entre requisições.`,
  saveTitle: "Salvar",
  saveIntro:
    "A fonte nasce pausada, aguardando ativação. Campos que ampliam direitos viram pedidos de segunda aprovação.",
  savePaused: "Salvar pausada",
  saveActivate: "Salvar e ativar",
  saving: "Salvando…",
  activateNeedsTerms: "Marque que leu os termos de uso para salvar e ativar.",
  createdNotActivated: (why: string) => `Fonte criada, mas não foi ativada: ${why}`,
  openCreated: "Abrir a fonte criada",
  progress: {
    label: "Progresso da análise",
    running: "Analisando o endereço…",
    robots: "Lendo robots.txt",
    discovery: "Procurando feed",
    test: "Testando a conexão",
    preview: "Montando a prévia",
    ai: "Sugestões da IA",
    ok: "ok",
    found: (strategy: string, where: string) => `encontrado ${strategy} em ${where}`,
    items: (n: number) => `${n} ${n === 1 ? "item" : "itens"}`,
    notFound: "nada encontrado",
    aiOk: "prontas",
    aiSkipped: "não usadas",
    waiting: "aguardando",
  },
} as const;

/** Alertas de qualidade sugeridos pela IA (`QualityFlag`). */
export const QUALITY_FLAG_TEXT: Record<string, string> = {
  caca_clique: "Títulos com cara de caça-clique",
  agregador: "Parece um agregador de conteúdo de terceiros",
  paywall: "Conteúdo atrás de paywall",
  baixa_relevancia_local: "Pouca relevância para Cuiabá e região",
  patrocinado: "Muito conteúdo patrocinado",
  sem_data: "Itens sem data de publicação",
};

export const FIELDS = {
  identity: "Identificação",
  classification: "Classificação",
  rights: "Direitos",
  collection: "Coleta",
  importance: "Importância",
  name: "Nome da fonte",
  slug: "Identificador (slug)",
  slugHint: "Só letras minúsculas, números e hífen. Não muda depois de criada.",
  layer: "Camada",
  layerNone: "Sem camada",
  categories: "Editorias",
  categoriesHint: (all: string) => `Até 6, separadas por vírgula. Disponíveis: ${all}.`,
  locality: "Localidade",
  reliability: "Confiabilidade",
  imagePolicy: "Política de imagem",
  republishPolicy: "Política de republicação",
  maySoleSource: "Pode ser a única fonte de um assunto",
  agreementUntil: "Acordo válido até",
  agreementNote: "Nota do acordo",
  termsUrl: "Endereço dos termos de uso",
  termsMinInterval: "Intervalo mínimo dos termos (minutos)",
  termsReviewed: "Termos de uso revisados",
  termsReviewedOn: (when: string) => `Termos revisados em ${when}`,
  baseUrl: "Endereço do site",
  feedUrl: "Endereço do feed ou da lista",
  kind: "Tipo de coleta",
  kindValue: { rss: "Feed", sitemap: "Sitemap", api: "API ou JSON Feed", page: "Página" } as Record<
    string,
    string
  >,
  selectors: "Seletores da página",
  frequency: "Frequência de coleta",
  rateLimit: "Limite de requisições por hora",
  score: "Score editorial",
  scoreHint: "1 a 5. Fontes com score 1 não aparecem no Veja também da home.",
  priority: "Prioridade",
  critical: "Exige segunda aprovação",
  criticalHint:
    "Alterar este campo para um valor que amplia direitos cria um pedido para outra pessoa aprovar. O valor só muda depois da aprovação.",
  justification: "Justificativa da alteração",
  justificationHint: "Obrigatória quando uma alteração exige segunda aprovação.",
  suggestionIa: "Sugestão da IA",
  suggestionRule: "Sugestão automática",
  applyIa: (label: string) => `Usar sugestão da IA para ${label}`,
  applyRule: (label: string) => `Usar sugestão automática para ${label}`,
  applied: "Sugestão aplicada",
  confidence: (pct: number) => `confiança ${pct}%`,
  needsApproval: "Exige segunda aprovação",
  save: "Salvar alterações",
  saving: "Salvando…",
  readOnly: "Somente leitura: a fonte está arquivada.",
  dirty: "Alterações ainda não salvas",
  approvalHint: (n: number) =>
    n === 1
      ? "1 campo exige segunda aprovação e vira um pedido."
      : `${n} campos exigem segunda aprovação e viram pedidos.`,
} as const;

export const FREQUENCY_FIELD = {
  defaultOption: (min: number) => `Padrão (${durationLabel(min)})`,
  fastGroup: "Via rápida",
  normalGroup: "Ciclo normal",
  help: "Abaixo de 30 min a fonte entra na via rápida: coleta a cada 10 min, processamento no ciclo normal.",
  fastInactive: "Ative a fonte antes de colocá-la na via rápida.",
  fastFull: (used: number, max: number) =>
    `A via rápida está cheia: ${used} de ${max} fontes. Tire outra fonte da via rápida ou peça para aumentar o limite.`,
  fastNewSource: "Fonte nova nasce no ciclo normal. Escolha a via rápida depois de ativar.",
  effective: (min: number, raisedBy: "robots" | "terms") =>
    `Frequência efetiva: ${durationLabel(min)}. ${raisedBy === "robots" ? "O robots.txt pede intervalo maior." : "Os termos de uso pedem intervalo maior."}`,
  effectiveFast: (min: number) => `Frequência efetiva: ${min} min · via rápida.`,
  fifteen: "Coletas alinhadas à grade de 15 min: intervalos de 10 e 20 min, média de 15.",
  next: (hhmm: string) => `Próxima coleta prevista: ${hhmm}`,
  noNext: "Sem coleta prevista: só fontes ativas são coletadas.",
  rateWarn: (limit: number) =>
    `Com limite de ${limit} requisições por hora, parte das coletas será pulada.`,
  fastButSlow:
    "Na via rápida, mas coletada a cada 30 min ou mais por causa do robots.txt ou dos termos de uso.",
} as const;

export const HEALTH = {
  title: "Saúde operacional",
  score: "Score operacional",
  scoreNone: "Sem coletas nos últimos 30 dias",
  components: "De onde vem o score",
  availability: "Disponibilidade em 30 dias",
  errorRate: "Falhas hoje",
  freshness: "Frescor",
  freshnessValue: (hours: number | null) =>
    hours === null
      ? "Nenhum item novo em 30 dias"
      : hours < 1
        ? "Item novo há menos de 1 h"
        : `Último item novo há ${Math.floor(hours)} h`,
  availabilityValue: (ok: number, failed: number) =>
    ok + failed === 0
      ? "Sem coletas"
      : `${Math.round((ok / (ok + failed)) * 100)}% (${ok} de ${ok + failed} coletas)`,
  errorRateValue: (failed: number, ok: number) =>
    `${failed} ${failed === 1 ? "falha" : "falhas"} e ${ok} ${ok === 1 ? "coleta ok" : "coletas ok"}`,
  chartTitle: "Coletas por dia (últimos 30 dias)",
  chartSummary: (ok: number, failed: number, items: number) =>
    `Nos últimos 30 dias: ${ok} ${ok === 1 ? "coleta ok" : "coletas ok"}, ${failed} ${failed === 1 ? "falha" : "falhas"} e ${items} ${items === 1 ? "item novo" : "itens novos"}.`,
  chartEmpty: "Ainda não há coletas registradas para desenhar o gráfico.",
  dataTable: "Ver os dados por dia",
  colDay: "Dia",
  colOk: "Coletas ok",
  colNotModified: "Sem mudança",
  colFailed: "Falhas",
  colItems: "Itens novos",
  colLatency: "Latência média",
  legendOk: "Coleta ok",
  legendFailed: "Falha",
  lastCollection: "Última coleta",
  nextCollection: "Próxima coleta",
  never: "Nunca coletada",
  itemsNew: "Itens novos por dia",
  latency: (ms: number | null) => (ms === null ? "—" : `${ms} ms`),
} as const;

export const COLLECTION = {
  title: "Coleta e teste",
  strategy: "Estratégia atual",
  lane: "Via de coleta",
  laneFast: "Via rápida",
  laneNormal: "Ciclo normal",
  frequency: "Frequência",
  address: "Endereço de coleta",
  crawlDelay: "Crawl-delay do robots.txt",
  crawlDelayValue: (s: number | null) => (s === null ? "Não informado" : `${s} s`),
  cacheTitle: "Requisição condicional",
  cacheYes:
    "A fonte informa ETag ou Last-Modified: a coleta pergunta se algo mudou antes de baixar o feed.",
  cacheNo:
    "Esta fonte não informa ETag nem Last-Modified: cada coleta rápida baixa o feed inteiro.",
  actionsTitle: "Testar e coletar",
  testConnection: "Testar conexão",
  testing: "Testando…",
  collectNowLabel: "Coletar agora",
  testHint: "Testa o endereço sem ingerir nada. 30 testes por hora por pessoa.",
  collectHint:
    "Enfileira uma coleta agora. Vale para fontes ativas ou instáveis, uma vez a cada 5 minutos.",
  reanalyze: "Reanalisar o link",
  runsTitle: "Últimas coletas",
  runsEmpty: "Nenhuma coleta registrada ainda para esta fonte.",
  discoveredTitle: "Como descobrimos",
  discoveredNone: "Esta fonte foi cadastrada à mão, sem descoberta automática.",
  selectorsNone: "Sem seletores de página.",
} as const;

export const REC = {
  title: "Recomendação",
  intro:
    "Ajustes de como a fonte aparece nas listas de recomendação do portal. Cada mudança fica na auditoria.",
  displayName: "Nome exibido",
  displayNameHint: "Se vazio, o portal usa o nome da fonte. Até 60 caracteres.",
  logo: "Logotipo",
  logoHint: "PNG ou WebP quadrado, de 96 por 96 pixels a 200 KB. SVG não é aceito.",
  logoUpload: "Enviar logotipo",
  logoNone: "Sem logotipo: o portal mostra o monograma da fonte.",
  logoCurrent: (name: string) => `Logotipo atual de ${name}`,
  pinned: "Fixar no topo das listas de fontes",
  pinnedHint: "Fixar conta no teto de 25% por fonte.",
  localHighlight: "Destacar como fonte local",
  localHighlightHint: "Entra no destaque de fontes de Cuiabá e região.",
  excluded: "Excluir da recomendação",
  excludedHint: "A fonte segue coletada e visível no Panorama, mas não é recomendada.",
  weights: "Ver pesos e campanhas de recomendação",
  save: "Salvar recomendação",
  saved: "Recomendação salva.",
  previewTitle: "Como aparece",
  previewLabel: "Prévia da fonte nas listas",
  noChange: "Nada mudou.",
  invalid: "Confira os campos destacados.",
  displayNameError: "O nome exibido pode ter até 60 caracteres.",
} as const;

export const HISTORY = {
  title: "Histórico",
  intro: "Quem mudou o quê, quando e por quê. A auditoria só recebe registros novos.",
  empty: "Nenhum registro de auditoria para esta fonte.",
  caption: "Auditoria da fonte",
  colWhen: "Quando",
  colWho: "Quem",
  colAction: "Ação",
  colChanges: "O que mudou",
  colReason: "Motivo",
  colApproval: "Aprovação",
  approved: "Com segunda aprovação",
  batch: "Em lote",
  none: "—",
  system: "Sistema",
  unknownPerson: "Pessoa não identificada",
  actions: {
    "source.create": "Cadastro",
    "source.update": "Edição",
    "source.status": "Mudança de estado",
    "source.archive": "Exclusão (arquivamento)",
    "source.restore": "Restauração",
    "source.collect_now": "Coleta manual",
    "source.test_connection": "Teste de conexão",
    "source.analyze": "Análise de link",
    "source.approval_requested": "Pedido de aprovação",
    "source.approval_applied": "Aprovação aplicada",
    "source.approve_critical": "Aprovação de mudança crítica",
    "settings.update": "Configuração da coleta",
  } as Record<string, string>,
  page: (n: number, total: number) => `Página ${n} de ${total}`,
  prev: "Página anterior",
  nextPage: "Próxima página",
  navLabel: "Paginação do histórico",
  totalRows: (n: number) => `${n} ${n === 1 ? "registro" : "registros"}`,
} as const;

/** Nomes dos campos como aparecem em `audit_log.details.changes`. */
export const AUDIT_FIELD_LABEL: Record<string, string> = {
  name: "Nome",
  display_name: "Nome exibido",
  slug: "Identificador",
  base_url: "Endereço do site",
  feed_url: "Endereço do feed",
  kind: "Tipo de coleta",
  status: "Estado",
  status_reason: "Motivo do estado",
  frequency_minutes: "Frequência",
  rate_limit_per_hour: "Limite por hora",
  priority: "Prioridade",
  categories: "Editorias",
  locality: "Localidade",
  reliability: "Confiabilidade",
  image_policy: "Política de imagem",
  republish_policy: "Política de republicação",
  may_be_sole_source: "Fonte única",
  owner_id: "Responsável",
  agreement_until: "Acordo até",
  agreement_note: "Nota do acordo",
  logo_path: "Logotipo",
  rec_pinned: "Fixada na recomendação",
  rec_local_highlight: "Destaque local",
  rec_excluded: "Excluída da recomendação",
  editorial_score: "Score editorial",
  layer: "Camada",
  consumption: "Configuração de coleta",
  terms_url: "Endereço dos termos",
  terms_reviewed_at: "Termos revisados em",
  terms_min_interval_minutes: "Intervalo mínimo dos termos",
  archived_at: "Arquivada em",
  archive_reason: "Motivo do arquivamento",
  "settings.default_frequency": "Frequência padrão",
};

export function auditValueText(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (field === "frequency_minutes" && typeof value === "number")
    return value < 30 ? `${value} min (via rápida)` : durationLabel(value);
  if (field === "status" && typeof value === "string")
    return SOURCE_STATUS_LABEL[value as keyof typeof SOURCE_STATUS_LABEL] ?? value;
  if (field === "status_reason" && typeof value === "string")
    return STATUS_REASON_LABEL[value as keyof typeof STATUS_REASON_LABEL] ?? value;
  if (field === "image_policy" && typeof value === "string")
    return IMAGE_POLICY_LABEL[value as ImagePolicy] ?? value;
  if (field === "republish_policy" && typeof value === "string")
    return REPUBLISH_POLICY_LABEL[value as RepublishPolicy] ?? value;
  if (field === "reliability" && typeof value === "string")
    return RELIABILITY_LABEL[value as Reliability] ?? value;
  if (field === "locality" && typeof value === "string")
    return LOCALITY_LABEL[value as keyof typeof LOCALITY_LABEL] ?? value;
  if (field === "priority" && typeof value === "number")
    return PRIORITY_LABEL[value as 1 | 2 | 3] ?? String(value);
  if (field === "consumption") return "atualizada";
  if (field === "archived_at" || field === "terms_reviewed_at") return "registrado";
  if (Array.isArray(value)) return value.length === 0 ? "nenhuma" : value.join(", ");
  if (typeof value === "object") return "atualizado";
  return String(value);
}

export const RUNS = {
  caption: "Últimas coletas da fonte",
  colWhen: "Quando",
  colResult: "Resultado",
  colDetail: "Detalhe",
  level: { info: "Ok", warn: "Atenção", error: "Falha", security: "Segurança" },
  empty: "Nenhuma coleta registrada ainda para esta fonte.",
} as const;

export const ITEMS = {
  title: "Itens coletados",
  intro: "Os últimos 50 itens da fonte: só título, data e link para o original.",
  empty: "Esta fonte ainda não trouxe nenhum item.",
  caption: "Últimos itens coletados",
  colTitle: "Título",
  colPublished: "Publicado",
  colCollected: "Coletado",
  open: (title: string) => `Abrir o original: ${title} (abre em outra aba)`,
  noDate: "Sem data",
} as const;

export const CONFIG = {
  title: "Configuração",
  archivedNote: "A fonte está arquivada. Restaure para editar.",
} as const;

export const RESUMO = { title: "Resumo e saúde" } as const;
