/**
 * Textos do Estúdio para a coleta da Agenda (AGM-T6 e seguintes): como a fonte é lida, origem,
 * situação da execução e motivo de cada recusa. Só Estúdio e Control Center (aqui "IA" pode
 * aparecer); a tela pública usa `portal-agenda.ts`.
 */
import type { SourceStatus as RunStatus } from "@/lib/agenda/collect";
import type { RejectReason, SourceKind as ExtractKind } from "@/lib/agenda/types";

/** Tipo de extração (`sources.extract_kind`). */
export const EXTRACT_KIND_TEXT: Record<ExtractKind, string> = {
  jsonld: "Dados estruturados da página (JSON-LD)",
  ical: "Calendário iCal",
  rss: "Feed RSS",
  sympla: "Lista de eventos da Sympla",
  tribe: "API de eventos do WordPress (The Events Calendar)",
  ai_page: "Leitura da página com IA",
};

/** Origem do evento (`sources.event_origin`). */
export const EVENT_ORIGIN_TEXT: Record<"official" | "organizer", string> = {
  official: "Órgão público",
  organizer: "Organizador, casa ou plataforma",
};

/** Situação da fonte numa execução da coleta. */
export const RUN_STATUS_TEXT: Record<RunStatus, string> = {
  ok: "Ok",
  robots: "Bloqueada pelo robots.txt",
  indisponivel: "Fonte indisponível",
  erro: "Erro na coleta",
  ia_adiada: "Adiada: teto ou prazo da IA",
  adiada: "Adiada: prazo da execução",
};

/** Motivo de recusa de um evento coletado, em texto (nunca só o código). */
export const REJECT_REASON_TEXT: Record<RejectReason, string> = {
  sem_titulo: "Sem título",
  sem_data: "Sem data",
  sem_horario: "Sem horário",
  data_passada: "Data já passou",
  data_distante: "Data distante demais",
  evento_online: "Evento on-line",
  fora_de_cuiaba: "Fora de Cuiabá e Várzea Grande",
  local_desconhecido: "Local desconhecido",
  palavrao: "Linguagem imprópria",
  texto_suspeito: "Texto suspeito na página",
  fora_do_perfil: "Fora do perfil da Agenda",
  link_suspeito: "Link suspeito",
  sem_link: "Sem link para o evento",
  sem_ano: "Data sem ano na página",
  trecho_ausente: "Trecho de evidência não encontrado na página",
  extracao_invalida: "Leitura da página inválida",
};

/** Campo do evento sustentado por um trecho da página (evidência). */
export const EVIDENCE_FIELD_TEXT = {
  titulo: "Título",
  data: "Data",
  horario: "Horário",
  local: "Local",
  cidade: "Cidade",
  preco: "Preço",
  organizador: "Organizador",
  faixa: "Faixa etária",
} as const;

/** Onde o modelo viu o ano da data. */
export const EVIDENCE_YEAR_TEXT = {
  corpo: "ano no texto da página",
  url: "ano no endereço da página",
  ausente: "sem ano na página",
} as const;

/* Eventos da Agenda no Estúdio (AGM-T7, spec §5.2): lista com filtros, cadastro, edição,
 * retirada e devolução; as sugestões de leitores (E13) viram a segunda aba da área. */

export const AGENDA_AGE_RATINGS = ["livre", "10", "12", "14", "16", "18", "consulte"] as const;
export type AgendaAgeRating = (typeof AGENDA_AGE_RATINGS)[number];

export const STUDIO_AGENDA_TEXT = {
  metaTitle: "Agenda · Estúdio · CityNews Cuiabá",
  title: "Agenda",
  intro:
    "Todos os eventos da agenda: os coletados das fontes, os de leitores e os cadastrados pela redação. O que a redação edita a coleta não sobrescreve.",
  tabsLabel: "Abas da Agenda",
  tabs: { events: "Eventos", submissions: "Sugestões" },
  add: "Novo evento",
  table: {
    caption: "Eventos da agenda",
    headers: {
      event: "Evento",
      when: "Data",
      venue: "Local",
      source: "Fonte",
      situation: "Situação",
      actions: "Ações",
    },
    edit: (title: string) => `Editar ${title}`,
    editShort: "Editar",
    withdraw: "Retirar do ar",
    restore: "Devolver ao ar",
    withdrawOf: (title: string) => `Retirar do ar: ${title}`,
    restoreOf: (title: string) => `Devolver ao ar: ${title}`,
    newsroom: "Redação",
    noSource: "Sem fonte",
    locked: (n: number) => (n === 1 ? "1 campo editado" : `${n} campos editados`),
    featured: (date: string) => `Em destaque até ${date}`,
  },
  origin: {
    official: "Oficial",
    organizer: "Organização",
    reader: "Leitor",
    newsroom: "Redação",
  } as Record<string, string>,
  situation: {
    no_ar: "No ar",
    retirado: "Retirado",
    encerrado: "Encerrado",
    sem_confirmacao: "Sem confirmação",
  },
  filters: {
    search: "Buscar por nome ou local",
    searchPlaceholder: "Ex.: Siriri",
    from: "De",
    to: "Até",
    source: "Fonte",
    sourceAll: "Todas as fontes",
    origin: "Origem",
    originAll: "Todas as origens",
    situation: "Situação",
    situationAll: "Todas",
    submit: "Filtrar",
    clear: "Limpar filtros",
  },
  pagination: "Paginação dos eventos",
  total: (n: number) => (n === 1 ? "1 evento" : `${n} eventos`),
  empty: {
    noneTitle: "Nenhum evento na agenda",
    noneBody: "Cadastre o primeiro evento ou aguarde a próxima coleta das fontes.",
    filteredTitle: "Nenhum evento com estes filtros",
    filteredBody: "Mude ou limpe os filtros para ver mais eventos.",
  },
  error: {
    title: "Não foi possível carregar os eventos",
    body: "A leitura falhou. Tente de novo em instantes.",
    retry: "Tentar de novo",
  },
  done: {
    salvo: "Evento salvo",
    criado: "Evento salvo e publicado na agenda",
    retirado: "Evento retirado do ar",
    devolvido: "Evento de volta ao ar",
    destacado: "Evento em destaque na Agenda",
    "sem-destaque": "Destaque retirado",
  } as Record<string, string>,
  actionFailed:
    "Não foi possível mudar a situação do evento. Confira se seu papel inclui a Agenda e tente de novo.",
  form: {
    newTitle: "Novo evento",
    newIntro: "Evento cadastrado pela redação entra na agenda na hora, com origem Redação.",
    editTitle: (title: string) => `Editar: ${title}`,
    editIntro:
      "Campos que você mudar ficam travados: a coleta automática não os sobrescreve depois.",
    breadcrumbs: { agenda: "Agenda", new: "Novo evento", edit: "Editar evento" },
    fields: {
      title: "Nome do evento",
      startsAt: "Início (fuso de Cuiabá)",
      endsAt: "Fim (opcional)",
      venue: "Local",
      neighborhood: "Bairro (opcional)",
      price: "Preço em reais",
      priceUnknown: "Preço não informado",
      category: "Categoria",
      ageRating: "Faixa etária",
      accessibility: "Acessibilidade (opcional)",
      link: "Link oficial (opcional)",
      description: "Descrição curta (opcional)",
      organizer: "Organização (opcional)",
      venueId: "Local do Guia",
    },
    hints: {
      price: "0 para gratuito. Exemplo: 40 ou 25,50",
      link: "Endereço completo com https, sem encurtador",
      description: "Até 2 frases e 300 caracteres",
      accessibility: "Exemplo: rampa de acesso e intérprete de Libras",
      organizer: "Quem promove o evento. Exemplo: Coletivo Siriri do Porto",
      venueId:
        "Liga o evento à página do lugar no Guia (Ver no Guia). Escolher um lugar ou Nenhum trava o vínculo contra a coleta.",
    },
    venue: {
      auto: "Automático pelo local",
      none: "Nenhum",
      current: (name: string, auto: boolean) =>
        auto
          ? `Vínculo atual: ${name} (automático)`
          : `Vínculo atual: ${name} (escolhido pela redação)`,
      currentNone: "Vínculo atual: nenhum lugar do Guia",
      inactive: (name: string) => `${name} (fora do Guia ativo)`,
      error: "Não foi possível carregar os lugares do Guia. O vínculo atual fica como está.",
      empty: "Nenhum lugar ativo no Guia para escolher.",
    },
    ages: {
      livre: "Livre",
      "10": "10 anos",
      "12": "12 anos",
      "14": "14 anos",
      "16": "16 anos",
      "18": "18 anos",
      consulte: "Consulte a organização",
    } satisfies Record<AgendaAgeRating, string>,
    categoryPlaceholder: "Escolha a categoria",
    save: "Salvar evento",
    saving: "Salvando…",
    cancel: "Voltar para a agenda",
    summary: (n: number) =>
      n === 1 ? "Corrija 1 campo para salvar." : `Corrija ${n} campos para salvar.`,
    failed: "Não foi possível salvar o evento. Tente de novo.",
    conflict:
      "Já existe um evento com o mesmo endereço na agenda. Mude o nome ou a data e salve de novo.",
    invalidData: "O banco recusou um dos valores. Confira os campos e salve de novo.",
    forbidden: "Seu papel não permite editar eventos da agenda.",
    notFound: "Evento não encontrado.",
    lockedTitle: "Campos travados pela redação",
    lockedNone: "Nenhum campo travado: a coleta ainda pode atualizar este evento.",
    lockedField: {
      title: "Nome",
      starts_at: "Início",
      ends_at: "Fim",
      venue: "Local",
      neighborhood: "Bairro",
      price_cents: "Preço",
      price_unknown: "Preço não informado",
      category: "Categoria",
      description: "Descrição",
      source_url: "Link oficial",
      organizer: "Organização",
      age_rating: "Faixa etária",
      media_id: "Imagem",
      venue_id: "Local do Guia",
    } as Record<string, string>,
    statusTitle: "Situação",
    withdrawHint: "O evento some da agenda pública e da página dele; a coleta não o devolve.",
    restoreHint: "O evento volta para a agenda pública.",
    viewPublic: "Ver na agenda",
  },
  /** Destaque na Agenda (B5): "Destacar até {data}" e "Tirar destaque", auditados. */
  feature: {
    title: "Destaque",
    hint: "Evento em destaque aparece primeiro na home e na faixa Em destaque da Agenda até o fim do dia escolhido.",
    until: "Destacar até",
    submit: "Destacar",
    remove: "Tirar destaque",
    current: (date: string) => `Em destaque até ${date}`,
    none: "Sem destaque",
    invalid: "Escolha uma data de hoje até 90 dias para frente.",
  },
  errors: {
    title: "Informe o nome do evento, com 3 a 140 caracteres. Exemplo: Noite do Siriri",
    profanity: "Tire o palavrão do texto.",
    startsAt: "Informe a data e a hora de início. Exemplo: 10/10/2026, 19:00",
    startsPast: "A data de início já passou. Exemplo: 10/10/2026, 19:00",
    endsAt: "O fim precisa ser depois do início. Exemplo: 10/10/2026, 23:00",
    venue: "Informe o local, com 2 a 160 caracteres. Exemplo: Sesc Arsenal",
    neighborhood: "O bairro pode ter até 80 caracteres.",
    price: "Informe o preço em reais ou marque Preço não informado. Exemplo: 40 ou 25,50",
    category: "Escolha uma categoria da lista.",
    ageRating: "Escolha uma faixa etária da lista.",
    accessibility: "A acessibilidade pode ter até 200 caracteres.",
    link: "Use um link https completo, sem encurtador. Exemplo: https://teatro.exemplo.com.br/evento",
    description: "Use até 2 frases e 300 caracteres.",
    organizer: "O organizador pode ter até 160 caracteres. Exemplo: Coletivo Siriri do Porto",
  },
} as const;
