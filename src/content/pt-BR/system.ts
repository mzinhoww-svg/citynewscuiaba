/** Estados de sistema (P25): 404, 410, 500 e offline. */
export const SYSTEM = {
  notFoundMeta: "Página não encontrada · CityNews Cuiabá",
  notFoundTitle: "Não encontramos esta página",
  notFoundText: "A matéria pode ter sido movida. Busque pelo título ou volte ao início.",
  searchLabel: "Buscar no CityNews",
  searchPlaceholder: "Busque pelo título ou assunto",
  searchSubmit: "Buscar",
  backHome: "Voltar ao início",
  explore: "Explorar editorias",
  goneMeta: "Matéria retirada do ar · CityNews Cuiabá",
  goneTitle: "Esta matéria foi retirada do ar",
  goneReasonLabel: "Motivo informado pela redação:",
  goneText:
    "Registramos a retirada na página de correções. Se você chegou por um link antigo, busque o assunto para ver a cobertura atual.",
  goneCorrections: "Ver correções",
  errorTitle: "Algo deu errado ao carregar esta página",
  errorText:
    "O problema é nosso, não seu. Tente de novo em instantes; se continuar, volte ao início e siga pelas editorias.",
  errorCode: (code: string) => `Código do erro: ${code}`,
  retry: "Tentar de novo",
  offlineTitle: "Você está sem conexão",
} as const;
