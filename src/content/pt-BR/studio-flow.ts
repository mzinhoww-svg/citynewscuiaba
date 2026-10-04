/**
 * Decisão rápida no Estúdio (UX-W3-T1, itens 45, 46, 55 e 56): barra de ações no rodapé,
 * revisão em sequência, aprovação em lote do que as regras recomendam e da mídia.
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const DECISION_FLOW_TEXT = {
  /** Nome do grupo de ações (barra fixa abaixo de `xl`). */
  bar: "Decisão",
  approveNext: "Aprovar e ir para o próximo",
  more: "Mais ações",
  moreMenu: "Mais ações da decisão",
} as const;

export const QUEUE_FLOW_TEXT = {
  rationaleMore: "Ver mais",
  rationaleLess: "Ver menos",
  selectAll: "Selecionar todas",
  selectRecommended: (n: number) =>
    plural(n, "Selecionar a recomendada", `Selecionar as ${n} recomendadas`),
  approveRecommended: (n: number) =>
    plural(n, "Aprovar 1 recomendada", `Aprovar ${n} recomendadas`),
  approveRecommendedHint:
    "Publica só as selecionadas que as regras recomendaram publicar; as outras ficam na fila.",
  approvedRecommended: (n: number) =>
    plural(n, "1 matéria aprovada e publicada", `${n} matérias aprovadas e publicadas`),
  skipped: (n: number) => plural(n, "1 ficou na fila", `${n} ficaram na fila`),
  skipReason: {
    not_recommended: "as regras não recomendaram publicar",
    not_found: "não encontrada",
    forbidden: "seu papel não permite",
    invalid: "checklist incompleto",
    conflict: "alterada por outra pessoa ou modo leitura",
  } as Record<string, string>,
  /** Rótulos das células no cartão (abaixo de `md`; na tabela, o cabeçalho diz). */
  cell: { recommended: "Recomendação", assignee: "Responsável", due: "Prazo" },
} as const;

export const MEDIA_FLOW_TEXT = {
  bulkLabel: "Imagens selecionadas",
  selectAll: "Selecionar todas",
  select: (credit: string) => `Selecionar imagem: ${credit}`,
  selected: (n: number) => plural(n, "1 selecionada", `${n} selecionadas`),
  approveSelected: (n: number) => plural(n, "Aprovar 1 selecionada", `Aprovar ${n} selecionadas`),
  approvedMany: (n: number) => plural(n, "1 imagem aprovada", `${n} imagens aprovadas`),
  failedSome: (n: number) => plural(n, "1 não foi aprovada", `${n} não foram aprovadas`),
} as const;
