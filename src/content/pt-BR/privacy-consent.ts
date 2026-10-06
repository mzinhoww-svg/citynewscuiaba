/**
 * Textos do consentimento (spec §5.2, docs/screens.md P22). Módulo próprio: o aviso de
 * privacidade está em toda página e não deve levar ao navegador os outros textos de privacidade
 * (item 85, A-154).
 */
export const CONSENT_TEXT = {
  region: "Sua privacidade",
  title: "Sua privacidade no CityNews",
  body: "Usamos só o necessário para o site funcionar. Com seu aceite, contamos leituras sem identificar você e recomendamos fontes.",
  learnMore: "Saiba mais sobre privacidade",
  learnMoreShort: "Saiba mais",
  necessaryOnly: "Só o necessário",
  choose: "Escolher",
  acceptAll: "Aceitar métricas e recomendações",
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
