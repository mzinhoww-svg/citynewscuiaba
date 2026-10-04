/** Textos dos destaques (tela do admin, FD-T3 e FD-T4; módulo "Em destaque" da home, FD-T2). */
import type { FeaturedSource } from "@/lib/featured";

export const FEATURED_TEXT = {
  nav: "Destaques",
  title: "Destaques",
  intro:
    "Quem ocupa a manchete e as posições de destaque de cada página. O que você fixa fica até ser removido ou até o prazo escolhido; sem fixação, o automático ocupa a vaga e só aceita matéria com capa aprovada.",
  loading: "Carregando destaques",
  errorTitle: "Não foi possível carregar os destaques",
  errorBody: "Tente de novo em instantes. Se continuar, veja os logs do Control Center.",
  retry: "Tentar de novo",
  forbidden: "Seu papel não gerencia destaques.",
  board: "Posições de destaque",
  boardLabel: (label: string) => `Posição ${label}`,
  occupant: "Ocupante",
  empty: (until: string | null) =>
    until
      ? `Sem pino: o automático ocupa até ${until}.`
      : "Sem pino e sem matéria com capa para o automático.",
  emptySlot: "Sem matéria nesta posição",
  source: {
    manual: "Fixada",
    hot: "Em alta",
    automatic: "Automático",
  } satisfies Record<FeaturedSource, string>,
  until: (when: string) => `até ${when}`,
  untilRemoved: "até remover",
  pinnedBy: (name: string) => `Fixada por ${name}`,
  dropped: {
    gone: "A matéria fixada saiu do ar. O automático ocupa a vaga; escolha outra.",
    ineligible: "A matéria fixada não pode mais aparecer (patrocinada ou despublicada).",
    no_cover: "A matéria fixada está sem capa aprovada, então o automático ocupa a vaga.",
  },
  noCover: "Sem capa aprovada",
  noCoverWarning:
    "Esta matéria está sem capa aprovada e não pode ser destaque. Aprove uma imagem para ela primeiro.",
  actions: {
    pin: "Fixar matéria",
    swap: "Trocar",
    remove: "Remover",
    up: "Subir",
    down: "Descer",
    reorder: "Reordenar",
    cancel: "Cancelar",
    submit: "Fixar",
    confirm: "Remover fixação",
  },
  form: {
    title: "Fixar matéria",
    slot: "Posição",
    section: "Editoria",
    search: "Buscar por título",
    searchHint: "Só matérias publicadas, não patrocinadas e com capa aprovada.",
    results: "Resultados da busca",
    noResults: "Nenhuma matéria encontrada.",
    pick: "Escolher",
    chosen: (title: string) => `Escolhida: ${title}`,
    duration: "Por quanto tempo",
    durations: {
      "1h": "1 h",
      "3h": "3 h",
      "6h": "6 h",
      "12h": "12 h",
      "24h": "24 h",
      "3d": "3 dias",
      until_removed: "Até remover",
    },
    untilDate: "Até data e hora",
    untilDateLabel: "Data e hora final",
    note: "Observação (opcional)",
    preview: "Pré-visualização",
    previewText: (slot: string, title: string) => `${slot} passa a mostrar: ${title}.`,
    previewEnds: (when: string) => `Termina ${when}; depois volta ao automático.`,
    previewOpen: "Fica até você remover.",
    previewNone: "Escolha uma matéria para ver como a página ficará.",
  },
  confirmRemove: {
    title: "Remover fixação",
    text: (title: string, hours: number) =>
      `A fixação de “${title}” ainda vale por mais ${hours} h. Digite REMOVER para confirmar.`,
    textOpen: (title: string) =>
      `“${title}” está fixada sem prazo e continua no destaque até você remover. Digite REMOVER para confirmar.`,
    word: "REMOVER",
    label: "Digite REMOVER",
  },
  success: {
    pinned: "Matéria fixada. A página já mostra a nova posição.",
    removed: "Fixação removida. O automático voltou a ocupar a vaga.",
    reordered: "Ordem atualizada.",
  },
  error: {
    generic: "Não foi possível concluir. Tente de novo.",
    duration: "Prazo inválido: use de 1 hora a 14 dias à frente, ou deixe sem prazo.",
    ineligible: "Só matéria publicada e não patrocinada pode ser destaque.",
    no_cover: "Matéria sem capa aprovada não pode ser destaque.",
    capacity: "A posição está cheia. Remova ou troque uma das matérias fixadas.",
    slot: "Posição inválida.",
    not_found: "A fixação não foi encontrada (já foi removida?).",
    forbidden: "Seu papel não gerencia destaques.",
  },
  history: {
    title: "Últimos 30 pinos",
    empty: "Nenhuma fixação ainda.",
    col: { when: "Quando", slot: "Posição", article: "Matéria", who: "Quem", state: "Situação" },
    state: { active: "Ativo", removed: "Removido", expired: "Expirou" },
    action: (name: string) => name,
  },
} as const;
