/**
 * Textos do Guia Cuiabá (spec 2026-10-03-guia-cuiaba-listas-design.md): telas públicas e admin.
 * Vocabulário público sem menção a IA, revisão ou geração (R3, CLAUDE.md §5.3); origem em texto
 * simples ("Dados: ...").
 */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Fontes de dados → nome na tela pública. */
export const DATA_SOURCE_LABEL = {
  google: "Google",
  osm: "OpenStreetMap",
  tripadvisor: "TripAdvisor",
  site: "sites dos lugares",
  wikidata: "Wikidata",
  manual: "informações da redação",
} as const;

/** Ordem fixa da linha "Dados: ..." (a mais abrangente primeiro). */
const DATA_ORDER = ["google", "tripadvisor", "osm", "wikidata", "site", "manual"] as const;

/** "Dados: TripAdvisor, OpenStreetMap e sites dos lugares". */
export function dataLine(sources: readonly string[]): string {
  const set = new Set(sources);
  const names = DATA_ORDER.filter((s) => set.has(s)).map((s) => DATA_SOURCE_LABEL[s]);
  if (names.length === 0) return "";
  const joined =
    names.length === 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
  return `Dados: ${joined}`;
}

export const GUIDE = {
  nav: { index: "Guia Cuiabá", articles: "Matérias do Guia", back: "Voltar ao Guia" },
  index: {
    metaTitle: "Guia Cuiabá: listas de lugares",
    metaDescription:
      "Listas de padarias, restaurantes, bares, hotéis e outros lugares de Cuiabá, com o critério de cada lista à vista.",
    title: "Guia Cuiabá",
    intro:
      "Listas de lugares de Cuiabá, com o critério de cada uma à vista: de onde vêm os dados e como a ordem foi montada.",
    listsTitle: "Listas do Guia",
    sponsoredTitle: "Listas patrocinadas",
    sponsoredNote: "O patrocínio nunca altera a ordem das listas.",
    articlesLink: "Matérias do Guia",
    articlesText: "Reportagens e serviços sobre a vida em Cuiabá.",
    emptyTitle: "As primeiras listas do Guia chegam em breve",
    emptyText: "Enquanto isso, as matérias mais recentes do Guia Cuiabá:",
    emptyNoArticles: "Enquanto isso, veja as matérias do Guia Cuiabá pelo link acima.",
    errorTitle: "Não foi possível carregar o Guia agora",
    errorText: "Tente de novo em instantes.",
    retry: "Tentar de novo",
    loading: "Carregando as listas do Guia",
    places: (n: number) => `${n} ${plural(n, "lugar", "lugares")}`,
    updated: (date: string) => `Atualizada em ${date}`,
    cardCta: "Ver lista",
  },
  list: {
    criteriaTitle: "Como escolhemos",
    placesTitle: "Os lugares",
    updated: (date: string) => `Atualizada em ${date}`,
    sponsoredBy: (name: string) => `Patrocinado · ${name}`,
    sponsoredNote: "O patrocínio não altera a ordem da lista.",
    attribution: {
      google: "Avaliações: Google.",
      /** Lista com nota e foto do Google (A-212). */
      googleWithPhotos: "Avaliações e fotos: Google.",
      /** Lista só com foto do Google, sem nota de lá. */
      googlePhotos: "Fotos: Google.",
      tripadvisor: "Avaliações e ranking: TripAdvisor.",
      osm: "Mapa e endereços: © colaboradores do OpenStreetMap.",
    },
    notFoundTitle: "Esta lista não está disponível",
    notFoundText: "Ela pode ter sido atualizada ou retirada do ar.",
    errorTitle: "Não foi possível carregar a lista agora",
    loading: "Carregando a lista",
    rating: (value: string, count: number | null, source: "google" | "tripadvisor") => {
      const where = source === "google" ? "no Google" : "no TripAdvisor";
      return count && count > 0
        ? `${value} ${where} (${count.toLocaleString("pt-BR")} ${plural(count, "avaliação", "avaliações")})`
        : `${value} ${where}`;
    },
    rank: (n: number) => `${n}º no ranking do TripAdvisor em Cuiabá`,
    seeVenue: "Ver o lugar",
    otherLists: "Outras listas do Guia",
    position: (n: number) => `${n}º lugar`,
  },
  venue: {
    metaTitle: (name: string) => `${name} · Guia Cuiabá`,
    metaDescription: (name: string, category: string, where: string) =>
      `${name}: ${category}${where ? ` ${where}` : ""} em Cuiabá. Endereço, telefone, horário e as listas do Guia em que aparece.`,
    address: "Endereço",
    phone: "Telefone",
    hours: "Horário",
    site: "Site",
    instagram: "Instagram",
    price: (n: number) => "$".repeat(n),
    priceLabel: "Faixa de preço",
    appearsIn: "Aparece nestas listas",
    photos: "Fotos",
    photoCredit: (name: string) => `Foto: reprodução web · ${name}`,
    photoSource: "Fonte",
    /** Crédito da foto do Google (termos: nome do autor; A-212). */
    googlePhotoCredit: (author: string | null) =>
      author ? `Foto: ${author} · Google` : "Foto: Google",
    noPhoto: "Sem foto oficial por enquanto.",
    updated: (date: string) => `Dados atualizados em ${date}`,
    notFoundTitle: "Este lugar não está disponível",
    notFoundText: "Ele pode ter saído das listas do Guia.",
    errorTitle: "Não foi possível carregar o lugar agora",
    loading: "Carregando o lugar",
    tripadvisor: "Ver no TripAdvisor",
    googleMaps: "Ver no Google Maps",
    report: {
      title: "Informar um problema",
      intro: "Endereço errado, lugar fechado ou outra informação desatualizada? Conte para nós.",
      reason: "O que está errado",
      contact: "Seu e-mail (opcional, só para falarmos com você)",
      submit: "Enviar aviso",
      sending: "Enviando",
      done: "Recebemos o aviso. A equipe vai conferir o lugar e, enquanto isso, as listas que o citam ficam fora do ar.",
      error: "Não foi possível enviar agora. Tente de novo.",
      invalid: "Descreva o problema em pelo menos 5 caracteres.",
      rateLimited: "Muitos avisos em pouco tempo. Tente de novo mais tarde.",
    },
  },
  articles: {
    metaTitle: "Matérias do Guia Cuiabá",
    metaDescription: "Reportagens e serviços do Guia Cuiabá sobre a vida na cidade.",
    title: "Matérias do Guia",
    intro: "Reportagens e serviços sobre a vida em Cuiabá.",
    emptyTitle: "Ainda não há matérias no Guia",
    emptyText: "Volte em breve ou veja as listas de lugares.",
    errorTitle: "Não foi possível carregar as matérias agora",
    more: "Ver mais matérias",
    loading: "Carregando as matérias",
  },
} as const;

/** Textos do Estúdio (admin do Guia). */
export const GUIDE_ADMIN_TEXT = {
  title: "Guia Cuiabá",
  intro:
    "Listas de lugares geradas com dados públicos: veja as propostas, ajuste a lista, o critério e a ordem, e publique. O patrocínio nunca altera a ordem.",
  tabs: {
    label: "Áreas do Guia",
    proposals: "Propostas",
    lists: "Listas",
    venues: "Lugares",
    templates: "Modelos",
  },
  loading: "Carregando o Guia",
  status: {
    title: "Fontes de dados",
    tripadvisorOn: "TripAdvisor: ativo",
    tripadvisorOff: "TripAdvisor: sem chave, o Guia usa pesquisa web e OpenStreetMap",
    autoOn: "Publicação pelas regras do Guia: ligada",
    autoOff: "Publicação pelas regras do Guia: desligada (tudo passa pelo editor)",
    lastSync: (when: string | null) =>
      when ? `Última coleta de lugares: ${when}` : "Nenhuma coleta de lugares ainda",
    lastPropose: (when: string | null) =>
      when ? `Última proposta automática: ${when}` : "Nenhuma proposta automática ainda",
    counts: (open: number, published: number, venues: number) =>
      `${open} ${plural(open, "proposta aberta", "propostas abertas")} · ${published} ${plural(published, "lista publicada", "listas publicadas")} · ${venues} ${plural(venues, "lugar", "lugares")}`,
  },
  proposals: {
    empty: "Nenhuma proposta aberta.",
    emptyHint:
      "O Guia monta 3 propostas por semana. Você também pode propor por link ou manualmente.",
    byLink: "Propor por link",
    manual: "Propor manualmente",
    linkTitle: "Propor por link",
    linkIntro:
      "Cole o link de uma lista de outro veículo. O Guia pega só os nomes, confere cada lugar nas fontes de dados e monta a lista do CityNews. Nada do texto original é copiado.",
    linkField: "Link da lista",
    linkHint: "Exemplo: https://portal.example.com/melhores-padarias-de-cuiaba",
    categoryField: "Categoria (opcional)",
    categoryAuto: "Detectar pelo link",
    analyze: "Analisar o link",
    analyzing: "Analisando o link e conferindo os lugares",
    linkDone: (verified: number, discarded: number) =>
      `Proposta criada com ${verified} ${plural(verified, "lugar conferido", "lugares conferidos")}${discarded > 0 ? ` (${discarded} ${plural(discarded, "nome descartado", "nomes descartados")}: não achamos nas fontes)` : ""}.`,
    manualTitle: "Propor manualmente",
    manualIntro:
      "Escolha o título, a categoria e os lugares. O Guia calcula a pontuação e a ordem.",
    titleField: "Título da lista",
    titleHint: "Exemplo: Os 5 melhores cafés de Cuiabá",
    neighborhoodField: "Bairro (opcional)",
    venuesField: "Lugares da lista",
    venuesHint: "Marque de 3 a 20 lugares.",
    venuesNone: "Nenhum lugar cadastrado nesta categoria.",
    criteriaField: "Como escolhemos (opcional, o Guia sugere um texto)",
    createManual: "Criar proposta",
    manualDone: "Proposta criada.",
    origin: { template: "Modelo", link: "Link", manual: "Manual" },
    score: "Pontuação",
    breakdown: "Detalhe da pontuação",
    signal: { rating: "Nota", rank: "Ranking", mentions: "Menções", completeness: "Completude" },
    sources: "Fontes de dados",
    criteria: "Como escolhemos",
    analysis: {
      title: "Análise do link",
      host: (h: string) => `Origem: ${h}`,
      verified: "Conferidos",
      discarded: "Descartados (não achamos nas fontes)",
      kind: (k: string) => `Tipo de critério da lista original: ${k}`,
    },
    publish: "Publicar",
    adjust: "Ajustar",
    discard: "Descartar",
    published: (title: string) => `Lista publicada: ${title}.`,
    discarded: "Proposta descartada.",
    discardTitle: "Descartar a proposta",
    discardReason: "Motivo",
    discardConfirm: "Descartar",
    cancel: "Cancelar",
    missingNote: (m: string) => `Falta para publicar sozinha: ${m}`,
  },
  adjust: {
    title: (name: string) => `Ajustar: ${name}`,
    titleField: "Título",
    introField: "Introdução (opcional)",
    criteriaField: "Como escolhemos",
    criteriaHint: "Obrigatório. Explique a ordem em linguagem simples.",
    items: "Lugares, na ordem da lista",
    up: "Subir",
    down: "Descer",
    remove: "Tirar da lista",
    note: "Nota do editor (opcional)",
    add: "Incluir lugar",
    addNone: "Escolha um lugar",
    save: "Salvar ajustes",
    saved: "Lista ajustada.",
    manualOrder:
      "A ordem foi definida por você. Se mudou a ordem, lembre de dizer isso em Como escolhemos.",
  },
  lists: {
    empty: "Nenhuma lista ainda.",
    table: "Listas do Guia",
    col: {
      title: "Lista",
      status: "Situação",
      origin: "Origem",
      updated: "Atualizada em",
      next: "Próxima atualização",
      sponsor: "Patrocínio",
      actions: "Ações",
    },
    status: {
      proposal: "Proposta",
      draft: "Rascunho",
      published: "Publicada",
      suspended: "Suspensa",
      discarded: "Descartada",
    },
    never: "—",
    view: "Ver no site",
    suspend: "Suspender",
    suspendTitle: "Suspender a lista",
    suspendReason: "Motivo",
    suspendConfirm: "Suspender",
    suspended: "Lista suspensa.",
    restore: "Reativar",
    restored: "Lista reativada.",
    sponsor: "Patrocínio",
    sponsorTitle: "Patrocínio da lista",
    sponsorRule:
      "Só do CityNews e de parceiros. O patrocínio mostra a etiqueta Patrocinado e nunca altera a ordem dos lugares.",
    sponsorOff: "Lista editorial (sem patrocínio)",
    sponsorKind: "Quem patrocina",
    sponsorKinds: { citynews: "CityNews", partner: "Parceiro do CityNews" },
    sponsorName: "Nome do parceiro",
    sponsorSave: "Salvar patrocínio",
    sponsorSaved: "Patrocínio atualizado.",
    reason: "Suspensa porque",
    sample: "Amostra para revisão",
    sampleHint: "Listas publicadas pelas regras do Guia, para o editor conferir.",
    ruleBy: "Publicada pelas regras",
    personBy: "Publicada por pessoa",
  },
  venues: {
    empty: "Nenhum lugar cadastrado.",
    table: "Lugares",
    col: {
      name: "Lugar",
      category: "Categoria",
      neighborhood: "Bairro",
      sources: "Fontes",
      rating: "Nota",
      status: "Situação",
      photo: "Foto",
      actions: "Ações",
    },
    status: { active: "Ativo", suspended: "Suspenso", inactive: "Inativo" },
    photo: { yes: "Foto oficial", no: "Cartão tipográfico" },
    new: "Novo lugar",
    edit: "Editar",
    dialog: {
      titleNew: "Novo lugar",
      titleEdit: (name: string) => `Editar ${name}`,
      name: "Nome",
      category: "Categoria",
      subcategory: "Cozinha ou tipo (opcional)",
      neighborhood: "Bairro",
      address: "Endereço",
      phone: "Telefone",
      website: "Site oficial",
      instagram: "Instagram",
      hours: "Horário",
      status: "Situação",
      save: "Salvar lugar",
      saved: "Lugar salvo.",
    },
    takedown: "Retirar foto",
    takedownTitle: "Retirar a foto do lugar",
    takedownHint:
      "A foto sai do ar na hora, a cópia é apagada e o endereço da imagem nunca volta a ser copiado. O lugar passa a usar o cartão tipográfico.",
    takedownReason: "Motivo (pedido do estabelecimento, direito de imagem...)",
    takedownConfirm: "Retirar foto",
    takedownDone: "Foto retirada.",
    reports: {
      title: "Reclamações abertas",
      empty: "Nenhuma reclamação aberta.",
      about: (name: string) => `Sobre ${name}`,
      lists: (n: number) => `${n} ${plural(n, "lista suspensa", "listas suspensas")}`,
      dismiss: "Improcedente: reativar",
      confirm: "Procedente: tirar o lugar do ar",
      note: "Anotação (opcional)",
      dismissed: (n: number) =>
        `Reclamação encerrada. ${n} ${plural(n, "lista voltou", "listas voltaram")} ao ar.`,
      confirmed:
        "Reclamação confirmada: o lugar saiu do ar e as listas seguem suspensas até você ajustá-las.",
    },
  },
  templates: {
    empty: "Nenhum modelo cadastrado.",
    table: "Modelos do catálogo",
    col: {
      title: "Modelo",
      category: "Categoria",
      take: "Lugares",
      active: "Ativo",
      last: "Última proposta",
      actions: "Ações",
    },
    new: "Novo modelo",
    edit: "Editar",
    now: "Propor agora",
    nowDone: "Proposta criada a partir do modelo.",
    never: "nunca",
    dialog: {
      titleNew: "Novo modelo",
      titleEdit: (name: string) => `Editar ${name}`,
      title: "Título da lista",
      noun: "Como chamar os lugares (plural)",
      category: "Categoria",
      subcategory: "Cozinha (opcional)",
      neighborhood: "Bairro (opcional)",
      take: "Quantos lugares",
      min: "Mínimo de lugares para publicar sozinha",
      active: "Ativo",
      save: "Salvar modelo",
      saved: "Modelo salvo.",
    },
  },
  errors: {
    linkScheme: "O link precisa começar com http:// ou https://",
    extract: {
      invalid_url: "O endereço não é um link válido.",
      robots: "O site não permite a leitura automática desta página (robots.txt).",
      unavailable: "Não foi possível abrir a página agora. Tente de novo mais tarde.",
      rate_limited: "Muitas leituras deste site em pouco tempo. Tente de novo mais tarde.",
      http_error: "O site respondeu com erro ao abrir a página.",
      no_names: "Não encontramos uma lista de lugares nesta página.",
    },
    tooFew: (verified: number, total: number) =>
      `Só ${verified} de ${total} ${total === 1 ? "nome foi conferido" : "nomes foram conferidos"} nas fontes de dados. Uma lista precisa de pelo menos 3 lugares.`,
    title: "O título precisa ter de 8 a 160 caracteres.",
    category: "Escolha uma categoria válida.",
    minVenues: "A lista precisa de pelo menos 3 lugares.",
    venueMissing: "Algum lugar escolhido não existe mais.",
    venueInactive:
      "A lista tem lugar suspenso ou fora do ar. Tire o lugar da lista antes de publicar.",
    notEnoughVenues:
      "Ainda não há lugares suficientes para este modelo (mínimo de 3 com duas fontes de dados).",
    discarded: "A lista foi descartada e não pode ser alterada.",
    duplicate: "Há um lugar repetido na lista.",
    criteria: "A lista não publica sem o texto Como escolhemos (pelo menos 40 caracteres).",
    notPublishable: "Só propostas e rascunhos podem ser publicados.",
    reason: "Explique o motivo (pelo menos 3 caracteres).",
    notDiscardable: "Só propostas e rascunhos podem ser descartados.",
    notSuspendable: "Só listas publicadas podem ser suspensas.",
    notRestorable: "Só listas suspensas podem ser reativadas.",
    sponsorKind: "Escolha CityNews ou parceiro.",
    sponsorName: "Informe o nome do parceiro (de 2 a 80 caracteres).",
    venueName: "O nome do lugar precisa ter pelo menos 2 caracteres.",
    website: "O site precisa começar com http:// ou https://",
    templateExists: "Já existe um modelo com este título.",
    reportDecided: "Esta reclamação já foi decidida.",
    generic: "Não foi possível concluir. Tente de novo.",
  },
  retry: "Tentar de novo",
} as const;
