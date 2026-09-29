/** Textos do painel de recomendação (O17) e dos testes A/B (O18), P5-T7. */
import type { WeightKey } from "@/lib/ranking/types";

const pct = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
export const formatPct = (n: number) => pct.format(n);
const dec2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatWeight = (n: number) => dec2.format(n);
const dec3 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
export const formatSum = (n: number) => dec3.format(n);
const int = new Intl.NumberFormat("pt-BR");
export const formatInt = (n: number) => int.format(n);

export const WEIGHT_TEXT: Record<WeightKey, { label: string; hint: string }> = {
  popularity: { label: "Popularidade", hint: "Sessões e cliques na janela, em percentil" },
  individual: { label: "Individual", hint: "Só com Personalização: leituras, seguir e salvar" },
  recency: { label: "Recência", hint: "Matérias nas últimas 24 h e frescor do último item" },
  engagement: { label: "Engajamento", hint: "Salvamentos, compartilhamentos e retornos" },
  operational: { label: "Qualidade operacional", hint: "Disponibilidade de coleta em 30 dias" },
  diversity: {
    label: "Diversidade",
    hint: "Bônus para fontes menos acessadas ou de outras editorias",
  },
};

export const LIST_TEXT: Record<string, string> = {
  popular: "Populares",
  trending: "Em alta",
  recommended: "Recomendadas",
  followed: "Seguidas",
  local: "Locais",
  verified: "Verificadas",
  new: "Novas",
};

export const DISMISS_TEXT: Record<string, string> = {
  not_interested: "Não tenho interesse",
  already_know: "Já conheço esta fonte",
  hide_topic: "Não quero ver este tema",
  no_personalization: "Não quero recomendações personalizadas",
};

export const AUDIENCE_TEXT: Record<string, string> = {
  all: "Todos os leitores",
  local: "Cuiabá e Várzea Grande",
  anonymous: "Só anônimos",
  accounts: "Só contas",
};

export const EXPERIMENT_STATUS_TEXT: Record<string, string> = {
  running: "Em andamento",
  ended: "Encerrado",
  promoted: "Promovido",
};

export const REC_TEXT = {
  sectionLabel: "Control Center · Recomendação",
  title: "Recomendação de fontes",
  intro:
    "Como as fontes são ordenadas para o leitor: métricas dos últimos 30 dias, pesos ativos e propostas, campanhas de descoberta e testes A/B. Peso individual só existe com consentimento.",
  errorTitle: "Não foi possível carregar",
  errorBody: "O banco não respondeu. Tente de novo em instantes.",
  retry: "Tentar de novo",
  readOnly: "Seu papel vê o painel, mas não altera pesos, campanhas nem testes.",
  kpisTitle: "Indicadores (30 dias)",
  kpi: {
    version: "Versão do algoritmo",
    ctr: "CTR das recomendações",
    hideRate: "Taxa de ocultação",
    diversity: "Índice de diversidade",
    top3: "Concentração top-3",
    personalization: "Personalização ativa",
    audience: "Anônimos × contas",
    experiments: "Experimentos ativos",
  },
  ctrHint: (clicks: number, impressions: number) =>
    `${formatInt(clicks)} cliques em ${formatInt(impressions)} visualizações de fonte`,
  concentrationAlert:
    "Concentração acima de 50%: três fontes recebem mais da metade dos cliques. Considere aumentar o peso de diversidade ou uma campanha de descoberta.",
  noEvents:
    "Nenhum evento de recomendação nos últimos 30 dias. As métricas aparecem quando leitores usarem a área Fontes.",
  listsTitle: "CTR por lista",
  listsChart: "Cliques por lista de fontes nos últimos 30 dias",
  listsSummary: (top: string, n: number, ctr: string) =>
    `Lista com mais cliques: ${top} (${formatInt(n)}, CTR ${ctr}).`,
  reasonsTitle: "Cliques por razão",
  reasonsCaption: "Cliques em recomendação por justificativa mostrada",
  reasonCol: { reason: "Razão", clicks: "Cliques", share: "Parcela" },
  dismissTitle: "Ocultações por motivo",
  dismissCaption: "Ocultações de fonte por motivo escolhido",
  dismissCol: { reason: "Motivo", count: "Ocultações" },
  return7d: "Retorno em 7 dias (seguiu pela recomendação)",
  return7dText: (returned: number, followed: number) =>
    followed === 0
      ? "Ainda sem leitores que seguiram uma fonte pela recomendação há mais de 7 dias."
      : `${formatInt(returned)} de ${formatInt(followed)} voltaram em até 7 dias (${formatPct(returned / followed)}).`,

  weightsTitle: "Pesos do score",
  weightsIntro:
    "A soma precisa ser exatamente 1,00. A proposta abre um pedido rec.weights: quem propõe não aprova. Sem consentimento, o individual pesa 0 e os demais são renormalizados.",
  activeWeights: (version: string) => `Pesos ativos: ${version}`,
  sum: (s: string) => `Soma: ${s}`,
  sumOk: "Soma em 1,00: pode propor.",
  sumBad: "A soma precisa ficar em 1,00 (± 0,001) para propor.",
  weightLabel: (name: string) => `Peso de ${name}`,
  justification: "Justificativa da proposta",
  justificationRequired: "Explique por que os pesos mudam.",
  propose: "Propor pesos",
  proposing: "Propondo…",
  proposed: (v: string) => `Versão ${v} proposta. A aprovação precisa ser de outra pessoa.`,
  noChanges: "Os pesos são iguais aos ativos.",
  reset: "Voltar aos ativos",
  activate: (v: string) => `Ativar ${v}`,
  approveAndActivate: (v: string) => `Aprovar e ativar ${v}`,
  activated: (v: string) => `${v} em uso.`,
  activateForbidden: "Só quem aprovou (outra pessoa) ativa.",
  waitOther: "Seu pedido: a aprovação precisa ser de outra pessoa.",
  historyTitle: "Histórico de pesos",
  historyCaption: "Versões de pesos de recomendação, da mais recente para a mais antiga",
  historyCol: {
    version: "Versão",
    weights: "Pesos",
    proposedBy: "Proposta por",
    approvedBy: "Aprovada por",
    status: "Situação",
    when: "Criada em",
    actions: "Ações",
  },
  status: { active: "Ativa", approved: "Aprovada (inativa)", pending: "Aguardando aprovação" },
  someone: "outra pessoa",

  campaignsTitle: "Campanhas de descoberta",
  campaignsIntro:
    "Uma campanha reserva vagas de descoberta para fontes escolhidas, num período e para um público. Nunca substitui as fixações nem some com a origem.",
  campaignsCaption: "Campanhas de descoberta",
  campaignCol: {
    name: "Campanha",
    sources: "Fontes",
    period: "Período",
    quota: "Vagas por bloco",
    audience: "Público",
    status: "Situação",
    clicks: "Cliques (30 d)",
  },
  campaignActive: "Em andamento",
  campaignScheduled: "Agendada",
  campaignEnded: "Encerrada",
  noCampaigns: "Nenhuma campanha cadastrada.",
  newCampaign: "Nova campanha",
  campaignName: "Nome",
  campaignSources: "Fontes (até 20)",
  campaignStart: "Início",
  campaignEnd: "Fim",
  campaignQuota: "Vagas por bloco de 5",
  campaignAudience: "Público",
  createCampaign: "Criar campanha",
  creating: "Criando…",
  campaignCreated: (name: string) => `Campanha "${name}" criada.`,
  campaignSourcesRequired: "Escolha ao menos uma fonte.",
  campaignPeriodInvalid: "O fim precisa ser igual ou depois do início.",

  experimentsTitle: "Testes A/B",
  experimentsIntro:
    "Cada leitor cai numa variante de forma estável (hash do anonId). O rótulo da variante vai nos eventos como versão do algoritmo; encerrar e promover a vencedora abre um pedido de pesos com duas aprovações.",
  experimentsCaption: "Testes A/B de pesos",
  experimentCol: {
    name: "Teste",
    variants: "Variantes",
    split: "Alocação",
    status: "Situação",
    started: "Início",
  },
  noExperiments: "Nenhum teste cadastrado.",
  newExperiment: "Novo teste A/B",
  experimentName: "Nome",
  variantA: "Controle (variante 0)",
  variantB: "Variante 1",
  variantVersion: "Versão de pesos",
  splitLabel: "Alocação do controle (%)",
  createExperiment: "Criar teste",
  experimentCreated: (name: string) => `Teste "${name}" criado.`,
  experimentSameVersion: "As variantes precisam usar versões de pesos diferentes.",
  experimentNeedsApproved: "Só versões aprovadas entram num teste.",
  open: "Abrir",
} as const;

export const AB_TEXT = {
  sectionLabel: "Control Center · Recomendação",
  title: (name: string) => `Teste A/B: ${name}`,
  back: "Painel de recomendação",
  notFound: "Teste não encontrado",
  notFoundBody: "O teste pode ter sido removido ou o link está errado.",
  status: "Situação",
  started: "Início",
  ended: "Fim",
  variantsTitle: "Variantes e alocação",
  variantsCaption: "Variantes do teste com alocação e métricas",
  col: {
    variant: "Variante",
    version: "Pesos",
    split: "Alocação",
    label: "Rótulo nos eventos",
    impressions: "Visualizações",
    clicks: "Cliques",
    ctr: "CTR",
    return7d: "Retorno 7 d",
    diversity: "Diversidade",
    hideRate: "Ocultação",
  },
  chart: "CTR por variante",
  chartSummary: (best: string, ctr: string) => `Maior CTR: ${best} (${ctr}).`,
  significanceTitle: "Significância",
  significance: (p: string, sig: boolean) =>
    sig
      ? `Diferença de CTR entre controle e variante 1 significativa (p = ${p}, α = 0,05).`
      : `Diferença de CTR ainda não significativa (p = ${p}, α = 0,05). Aguarde mais leitores.`,
  noData: "Sem eventos com o rótulo deste teste ainda.",
  end: "Encerrar teste",
  ending: "Encerrando…",
  ended_: "Teste encerrado.",
  promote: (name: string) => `Promover ${name}`,
  promoteJustification: "Justificativa para promover",
  promoteHint: "Abre um pedido rec.weights com a versão da variante; outra pessoa aprova e ativa.",
  promoted: (v: string) =>
    `Pedido aberto para ativar ${v}. A aprovação precisa ser de outra pessoa.`,
  readOnly: "Seu papel vê o teste, mas não encerra nem promove.",
  errorTitle: "Não foi possível carregar",
  errorBody: "O banco não respondeu. Tente de novo em instantes.",
  retry: "Tentar de novo",
  genericError: "Não foi possível concluir. Tente de novo.",
  forbidden: "Seu papel não permite esta ação.",
} as const;

export const WHY_TEXT = {
  title: "Por que esta recomendação",
  intro:
    "Componentes do score de cada fonte para um leitor, identificado só pelo anonId pseudonimizado. Sem consentimento de personalização, o peso individual é 0.",
  anonId: "anonId do leitor",
  anonIdHint: "Identificador anônimo do navegador (UUID). Nunca um e-mail ou nome.",
  anonIdInvalid: "Informe um anonId válido (UUID).",
  explain: "Explicar",
  explaining: "Calculando…",
  pseudonym: (p: string) => `Leitor ${p}`,
  consentYes: "Com consentimento de personalização: sinais individuais entram no score.",
  consentNo: "Sem consentimento (ou sem eventos): peso individual 0, demais renormalizados.",
  caption: "Componentes do score por fonte",
  col: {
    source: "Fonte",
    score: "Score",
    reason: "Razão mostrada",
  },
  component: (name: string, weight: string, signal: string) =>
    `${name}: peso ${weight} × sinal ${signal}`,
  empty: "Nenhuma fonte visível para explicar.",
  close: "Fechar",
  audit: "Esta consulta fica registrada na auditoria.",
} as const;
