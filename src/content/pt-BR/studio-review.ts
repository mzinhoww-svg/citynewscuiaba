import type { RiskKey } from "@/lib/review/bulk-risk";

/**
 * Textos de "selecionar tudo" e "Publicar mesmo assim" na fila de revisão do Estúdio (REV-T1).
 * Vocabulário interno do Estúdio: pode usar os termos técnicos.
 */
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const REVIEW_BULK_TEXT = {
  selectAllPage: "Selecionar todas as matérias em revisão desta página",
  /** Barra depois de marcar o cabeçalho. */
  pageSelected: (n: number) =>
    `${plural(n, "1 matéria selecionada", `${n} matérias selecionadas`)} nesta página.`,
  selectAllMatching: (n: number) => `Selecionar todas as ${n} em revisão`,
  allSelected: (n: number) =>
    `Todas as ${n} matérias em revisão estão selecionadas, em todas as páginas.`,
  clearSelection: "Limpar seleção",
  barLabel: "Seleção de matérias em revisão",
  publishAnyway: "Publicar mesmo assim",
  dialogTitle: "Publicar mesmo assim",
  dialogIntro: (n: number) =>
    `Resumo dos principais riscos de ${plural(n, "1 matéria", `${n} matérias`)} que as regras seguravam para revisão.`,
  loading: "Calculando os riscos da seleção…",
  loadError: "Não foi possível calcular os riscos. Tente de novo.",
  retry: "Tentar de novo",
  noRisks: "Nenhum dos riscos checados apareceu nesta seleção.",
  nothingToPublish: "Nenhuma matéria da seleção pode ser publicada.",
  risksTitle: "Maiores riscos",
  example: "Exemplo",
  excluded: (n: number) =>
    `${plural(n, "1 matéria fica", `${n} matérias ficam`)} de fora e não será publicada: ${plural(n, "não tem", "não têm")} texto algum, ou sua editoria não é sua.`,
  responsibility:
    "Você assume a responsabilidade pela publicação destas matérias. Dá para desfazer cada uma em um clique.",
  cancel: "Cancelar",
  confirm: (n: number) => `Publicar ${n} ${plural(n, "matéria", "matérias")}`,
  risk: {
    sensitive_politica: (n: number) => `${n} em Política (editoria sensível)`,
    sensitive_seguranca: (n: number) => `${n} em Segurança (editoria sensível)`,
    sensitive_saude: (n: number) => `${n} em Saúde (editoria sensível)`,
    single_source: (n: number) => `${n} de fonte única`,
    no_photo: (n: number) => `${n} sem foto aprovada (publica com cartão tipográfico)`,
    short_text: (n: number) => `${n} com texto abaixo de 30 linhas`,
    doubtful: (n: number) => `${n} marcadas como duvidosas ou com fontes divergentes`,
    low_score: (n: number) => `${n} com baixa pontuação de confiança`,
    reported: (n: number) => `${n} já com denúncia aberta`,
    no_citable_source: (n: number) => `${n} sem fonte citável`,
  } satisfies Record<RiskKey, (n: number) => string>,
  /** Resultado e progresso (região de status). */
  progress: (done: number, total: number) => `Publicando ${done} de ${total}`,
  queued: (total: number) =>
    `Publicação de ${total} em fila. Pode continuar trabalhando; o andamento aparece aqui.`,
  success: (n: number) => `${plural(n, "1 matéria publicada", `${n} matérias publicadas`)}.`,
  partial: (done: number, left: number) =>
    `${plural(done, "1 matéria publicada", `${done} matérias publicadas`)}; ${plural(left, "1 ficou de fora", `${left} ficaram de fora`)}.`,
  failed:
    "Não foi possível publicar a seleção. Nada foi alterado além do que já aparece no resultado.",
  resultTitle: "Ficaram de fora",
  reasons: {
    no_body: "sem texto",
    forbidden: "sem permissão na editoria",
    status: "não está mais em revisão",
    not_found: "não encontrada",
    enqueue: "não entrou na fila",
  } as Record<string, string>,
  statusError: "Não foi possível atualizar o andamento. Tentando de novo.",
  forbidden: "Seu papel não permite publicar matérias da fila de revisão.",
  tooMany: (n: number) => `A seleção passa de ${n} matérias. Use um filtro para reduzir.`,
} as const;
