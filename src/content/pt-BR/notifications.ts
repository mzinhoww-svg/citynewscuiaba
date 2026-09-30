/**
 * Textos dos avisos do leitor (spec 2026-09-28 §7.4 C09, §7.5 P18, §15; D-P09). O texto do
 * pré-prompt é literal e não muda sem decisão registrada.
 */
export const NOTIF_TEXT = {
  invite: {
    title: "Quer receber avisos?",
    body: "Avisamos só do que você segue e de urgências, no máximo 3 por dia. Entre 22h e 7h, só urgências.",
    enable: "Ativar",
    notNow: "Agora não",
    enabled: "Avisos ativados. Ajuste em Alertas.",
    enabledLink: "Alertas",
    denied: "Tudo bem. Se mudar de ideia, veja em Alertas como reativar.",
    failed: "Não foi possível ativar os avisos agora. Tente de novo mais tarde.",
    retry: "Tentar de novo",
    rateLimited: "Muitas tentativas. Tente de novo em alguns minutos.",
  },
  settings: {
    title: "Avisos no celular e no computador",
    unsupportedBrowser: "Avisos pelo celular ainda não estão disponíveis neste navegador.",
    unavailable: "Avisos pelo celular ainda não estão disponíveis.",
    iosNeedsInstall: "No iPhone, os avisos funcionam com o CityNews na Tela de Início.",
    howToAdd: "Como adicionar",
    enableButton: "Ativar avisos",
    deniedTitle: "Os avisos estão bloqueados neste navegador.",
    deniedIntro: "Para reativar:",
    deniedSteps: {
      chrome:
        "Chrome ou Edge (Android e computador): toque no cadeado ao lado do endereço → Permissões → Notificações → Permitir.",
      edge: "Chrome ou Edge (Android e computador): toque no cadeado ao lado do endereço → Permissões → Notificações → Permitir.",
      samsung:
        "Samsung Internet: toque no cadeado ao lado do endereço → Permissões → Notificações → Permitir.",
      firefox:
        "Firefox: toque no cadeado ao lado do endereço → Permissões → remova o bloqueio de notificações.",
      safari:
        "Safari no Mac: Ajustes → Sites → Notificações → CityNews → Permitir. No iPhone: Ajustes → Notificações → CityNews.",
      other: "Nas configurações do navegador, em Notificações, permita o CityNews.",
    },
    reenabled: "Já reativei",
    kinds: {
      follow: "Do que você segue",
      urgent: "Urgentes",
      highlight: "Destaques da redação",
    },
    quiet: "Silêncio",
    quietStart: "Início",
    quietEnd: "Fim",
    quietNote: "Urgentes podem chegar no silêncio.",
    hour: (h: number) => `${h}h`,
    dailyLimit: "Máximo por dia",
    targetsTitle: "O que você segue",
    targetsEmpty: "Nada seguido ainda. Siga fontes, editorias, assuntos ou crie alertas de bairro.",
    targetsManage: "Gerenciar em Favoritos",
    disable: "Desativar avisos",
    disabled: "Avisos desativados neste navegador.",
    loading: "Carregando os avisos",
    saveError: "Não conseguimos salvar agora.",
    retry: "Tentar de novo",
    lost: "Os avisos deste navegador foram desativados. Ativar de novo?",
    activeIntro: "Avisos ativos neste navegador. Você pode ajustar o que chega e quando.",
  },
} as const;

/** Rótulos dos alvos enviados ao servidor (transparência em Alertas). */
export const TARGET_LABEL: Record<"source" | "section" | "topic" | "bairro", string> = {
  source: "Fonte",
  section: "Editoria",
  topic: "Assunto",
  bairro: "Bairro",
};
