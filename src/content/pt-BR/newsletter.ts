/** Newsletter (P19): listas, página, centro de preferências e e-mails de confirmação. */

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
  listsLegend: "Quais newsletters?",
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

/** E-mails para quem não tem conta (fila `reader_emails`, B-005). */
export const NEWSLETTER_MAIL = {
  confirmSubject: "Confirme sua inscrição no CityNews",
  confirmBody: (lists: string, link: string) =>
    `Recebemos um pedido para enviar ${lists} a este e-mail.\n\nPara confirmar, abra: ${link}\n\nSe não foi você, ignore esta mensagem: nada será enviado.`,
  manageSubject: "Suas newsletters do CityNews",
  manageBody: (link: string) =>
    `Este e-mail já está inscrito. Para mudar ou cancelar suas newsletters, abra: ${link}`,
} as const;
