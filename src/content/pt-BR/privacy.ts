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
