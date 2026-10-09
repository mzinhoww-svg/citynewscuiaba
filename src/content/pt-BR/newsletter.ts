/** Newsletter (P19): listas, página, centro de preferências e e-mails de confirmação. */

import { NEWSLETTER } from "./newsletter-form";

export const NEWSLETTER_LISTS = [
  {
    id: "diaria",
    name: "Cuiabá em 5 minutos",
    when: "Todo dia, às 7h",
    description: "O resumo do dia na cidade: o que mudou, o que abre e o que fecha.",
  },
  {
    id: "agenda-fds",
    name: "Agenda do fim de semana",
    when: "Quinta, às 12h",
    description: "Shows, feiras, teatro e esporte de sexta a domingo, com os gratuitos primeiro.",
  },
  {
    id: "politica-semana",
    name: "Política da semana",
    when: "Sexta, às 18h",
    description: "Câmara, prefeitura e Assembleia: as decisões da semana e o que vem a seguir.",
  },
] as const;

export type NewsletterListId = (typeof NEWSLETTER_LISTS)[number]["id"];

export const NEWSLETTER_PAGE = {
  metaTitle: "Newsletters · CityNews Cuiabá",
  metaDescription:
    "Receba o resumo de Cuiabá, a agenda do fim de semana e a política da semana no seu e-mail. Só pedimos o endereço.",
  title: "Newsletters",
  intro:
    "Escolha o que quer receber. Não precisa de conta: só o e-mail. Você confirma pelo link que enviamos e sai quando quiser.",
  listsLegend: NEWSLETTER.listsLegend,
  sample: "Amostra da última edição",
  sampleEmpty: "A primeira edição sai em breve.",
  email: "E-mail",
  placeholder: "voce@exemplo.com",
  submit: "Inscrever",
  sending: "Enviando…",
  listsRequired: "Escolha ao menos uma newsletter. Exemplo: Cuiabá em 5 minutos.",
  pending:
    "Enviamos um link de confirmação para o seu e-mail. Sem confirmação, nada é enviado. O envio das edições começa em breve.",
  already:
    "Este e-mail já recebe essas newsletters. Enviamos um link para você mudar as preferências.",
  privacy: "Usamos o e-mail só para as newsletters. Você pode sair a qualquer momento.",
  loading: "Carregando as newsletters",
  /** UI-T11: hero, lista e FAQ em blocos de marketing. */
  heroCta: "Escolher e inscrever",
  listsTitle: "As newsletters",
  faq: [
    {
      question: "Preciso criar conta?",
      answer: "Não. Só pedimos o e-mail, mais nada.",
    },
    {
      question: "Por que preciso confirmar?",
      answer:
        "Enviamos um link de confirmação para o seu e-mail. Sem confirmação, nada é enviado: ninguém inscreve você sem você saber.",
    },
    {
      question: "Quando chega a primeira edição?",
      answer:
        "O envio das edições começa em breve. O dia e o horário de cada newsletter aparecem na lista.",
    },
    {
      question: "Como mudo ou cancelo?",
      answer:
        "Peça a inscrição de novo com o mesmo e-mail: enviamos um link para você mudar as newsletters ou sair de todas.",
    },
    {
      question: "O que vocês fazem com o meu e-mail?",
      answer: "Usamos o e-mail só para as newsletters. Você pode sair a qualquer momento.",
    },
  ],
} as const;

export const NEWSLETTER_PREFS = {
  metaTitle: "Preferências da newsletter · CityNews Cuiabá",
  title: "Suas newsletters",
  confirmed: "Inscrição confirmada. Obrigado!",
  confirmAsk: "Falta confirmar",
  confirmAskText:
    "Toque no botão para confirmar a inscrição. Se não foi você que pediu, feche esta página: nada será enviado.",
  confirmButton: "Confirmar inscrição",
  intro: (email: string) => `Preferências de ${email}. Marque o que quer continuar recebendo.`,
  save: "Salvar preferências",
  saved: "Preferências salvas.",
  unsubscribeAll: "Sair de todas",
  unsubscribedTitle: "Você não receberá mais as newsletters do CityNews.",
  unsubscribedText: "Mudou de ideia? Você pode voltar a receber com um toque.",
  resubscribe: "Voltar a receber",
  expiredTitle: "Este link expirou",
  expiredText: "Por segurança, os links valem por 7 dias. Peça um novo na página das newsletters.",
  invalidTitle: "Este link não é válido",
  invalidText: "Confira se o endereço foi copiado inteiro, ou peça um novo link.",
  requestNew: "Pedir um novo link",
  errorTitle: "Não conseguimos carregar suas preferências agora",
  errorText: "Tente de novo em alguns minutos.",
  retry: "Tentar de novo",
  status: { active: "Recebendo", pending: "Aguardando confirmação", off: "Não recebe" },
} as const;

export { NEWSLETTER } from "./newsletter-form";

/** E-mails para quem não tem conta (fila `reader_emails`, B-005). */
export const NEWSLETTER_MAIL = {
  confirmSubject: "Confirme sua inscrição no CityNews",
  confirmBody: (lists: string, link: string) =>
    `Recebemos um pedido para enviar ${lists} a este e-mail.\n\nPara confirmar, abra: ${link}\n\nSe não foi você, ignore esta mensagem: nada será enviado.`,
  manageSubject: "Suas newsletters do CityNews",
  manageBody: (link: string) =>
    `Este e-mail já está inscrito. Para mudar ou cancelar suas newsletters, abra: ${link}`,
} as const;

/**
 * Edição "Agenda do fim de semana" (ARD-T5, spec 2026-10-08-agenda-rica-e-distribuicao §6):
 * assunto, página web da edição e e-mail (HTML e texto).
 */
export const NEWSLETTER_EDITION = {
  name: "Agenda do fim de semana",
  /** "Agenda do fim de semana · 9 a 11 de outubro" */
  subject: (range: string) => `Agenda do fim de semana · ${range}`,
  /** "9 a 11 de outubro" ou "30 de outubro a 1 de novembro" */
  range: (from: string, to: string) => `${from} a ${to}`,
  metaTitle: (range: string) => `Agenda do fim de semana · ${range} · CityNews Cuiabá`,
  metaDescription: (range: string) =>
    `Shows, feiras, teatro e esporte em Cuiabá de ${range}, com local, horário e preço.`,
  intro:
    "O que acontece em Cuiabá de sexta a domingo, com local, horário e preço. Os eventos confirmados pela organização vêm primeiro em cada dia.",
  eyebrow: "Newsletter",
  since: (day: string) => `desde ${day}`,
  until: (when: string) => `até ${when}`,
  freePrice: "Gratuito",
  unknownPrice: "Consulte a fonte",
  whenLabel: "Quando",
  whereLabel: "Onde",
  priceLabel: "Preço",
  seeEvent: "Ver o evento",
  seeEventLabel: (title: string) => `Ver ${title} na agenda do CityNews`,
  checkSource: "Confirme horários e valores na fonte oficial antes de sair de casa.",
  subscribeTitle: "Receba no seu e-mail",
  subscribeText: "A Agenda do fim de semana chega toda quinta. Só pedimos o e-mail.",
  subscribe: "Quero receber",
  fullAgenda: "Ver a agenda completa",
  readEdition: "Ler a edição completa",
  readEditionLabel: (range: string) =>
    `Ler a edição completa da Agenda do fim de semana de ${range}`,
  errorTitle: "Não conseguimos carregar esta edição agora",
  errorText: "Pode ser uma instabilidade passageira. Tente de novo em alguns minutos.",
  backNewsletter: "Voltar para as newsletters",
  /** E-mail */
  viewOnSite: "Ver no site",
  preheader: (range: string) => `Os eventos de ${range} em Cuiabá.`,
  footerWhy: "Você recebe este e-mail porque se inscreveu na Agenda do fim de semana do CityNews.",
  unsubscribe: "Sair desta newsletter",
  textUnsubscribe: (url: string) => `Para sair desta newsletter, abra: ${url}`,
  textViewOnSite: (url: string) => `Ver no site: ${url}`,
} as const;
