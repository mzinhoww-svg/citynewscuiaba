/** Textos do consentimento (spec §5.2, docs/screens.md P22) e do perfil anônimo (§5.3). */
export const CONSENT_TEXT = {
  region: "Sua privacidade",
  title: "Sua privacidade no CityNews",
  body: "Usamos só o necessário para o site funcionar. Com seu aceite, contamos leituras sem identificar você e recomendamos fontes.",
  learnMore: "Saiba mais sobre privacidade",
  learnMoreShort: "Saiba mais",
  necessaryOnly: "Só o necessário",
  choose: "Escolher",
  acceptAll: "Aceitar recomendações",
  panelTitle: "Escolha o que o CityNews pode usar",
  panelIntro: "Você pode mudar isso quando quiser na página de Privacidade.",
  save: "Salvar escolhas",
  back: "Voltar",
  alwaysOn: "Sempre ativos",
  categories: {
    necessary: {
      title: "Necessários",
      description: "Sessão, segurança e esta escolha. Não dá para desligar.",
    },
    metrics: {
      title: "Métricas agregadas",
      description: "Contagens de leitura sem identificador, para saber o que é mais lido.",
    },
    personalization: {
      title: "Personalização",
      description:
        "Histórico de leitura e um identificador anônimo neste navegador, para recomendar fontes e matérias.",
    },
  },
} as const;

/** Preferências na página /privacidade (P22). */
export const PRIVACY_PREFS_TEXT = {
  title: "Suas escolhas",
  intro:
    "A escolha fica guardada neste navegador no cookie cn_consent, com a versão da política. Sem escolha, vale só o necessário.",
  save: "Salvar escolhas",
  saved: "Escolhas salvas.",
  current: {
    undecided: "Você ainda não escolheu: vale só o necessário.",
    decided: "Escolha salva neste navegador.",
  },
} as const;

/** Perfil anônimo local (spec §5.3). */
export const ANON_TEXT = {
  /** Review Focus 2: IndexedDB indisponível, salvar e seguir valem só nesta visita. */
  degraded: "Não conseguimos salvar neste navegador",
  degradedDetail: "Suas escolhas valem só enquanto esta página estiver aberta.",
} as const;

/** P21 · Como usamos suas recomendações. */
export const RECS_PAGE_TEXT = {
  metaTitle: "Como usamos suas recomendações · CityNews Cuiabá",
  title: "Como usamos suas recomendações",
  intro:
    "As recomendações de fontes e matérias usam o que é popular em Cuiabá e, só se você deixar, o que você lê neste navegador. Nada aqui exige conta.",
  choices: "Suas escolhas",
  switchLabel: "Recomendações pelo que você lê",
  switchHelp:
    "Liga o histórico de leitura e o identificador anônimo neste navegador. Desligado, você vê o que é popular na região.",
  metricsLabel: "Métricas agregadas",
  metricsHelp: "Contagens de leitura sem identificar você.",
  necessary: "Necessários: sempre ativos (sessão, segurança e esta escolha).",
  browser: "Seu perfil neste navegador",
  browserCounts: (reads: number, searches: number) =>
    `${reads === 1 ? "1 leitura" : `${reads} leituras`} nos últimos 30 dias e ${
      searches === 1 ? "1 busca recente" : `${searches} buscas recentes`
    }.`,
  browserOff: "Com a personalização desligada, não guardamos histórico nem buscas.",
  interests: "Interesses considerados",
  interestsIntro:
    "Editorias que você leu com atenção. Nunca inferimos saúde, religião, posição política, raça, renda ou outro dado sensível.",
  interestsEmpty: "Nenhum interesse considerado ainda.",
  weak: "sinal fraco: ainda não usado",
  remove: (key: string) => `Remover ${key}`,
  removeText: "Remover",
  removed: "Interesse removido.",
  actions: "Controles",
  clear: "Apagar histórico local",
  cleared: "Histórico local apagado.",
  reset: "Redefinir recomendações",
  resetDone: "Recomendações redefinidas",
  disable: "Desativar recomendações personalizadas",
  disabled: "Recomendações personalizadas desativadas.",
  notifications: "Notificações",
  notificationsText: "Alertas do navegador e por e-mail são escolhas suas, uma por uma.",
  notificationsLink: "Gerenciar alertas",
  policy: "Política de privacidade",
  policyText: "O texto completo, os cookies por categoria e seus direitos na LGPD.",
  policyLink: "Ler a política de privacidade",
  loading: "Carregando suas escolhas",
} as const;

/** Leitura offline (spec 2026-09-28 §8.3): botão em /privacidade. */
export const PRIVACY_OFFLINE_TEXT = {
  title: "Leitura offline",
  intro:
    "Com internet, a página inicial, as editorias e as matérias que você abre ficam guardadas neste aparelho para leitura sem conexão (até 30 lidas e 20 salvas, cerca de 25 MB). Nada disso sai do navegador.",
  clear: "Limpar leitura offline",
  cleared: "Leitura offline apagada deste aparelho.",
  nothing: "Nada para apagar neste aparelho.",
} as const;
