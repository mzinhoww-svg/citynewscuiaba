/** Textos da página Interruptores (admin): todas as chaves liga/desliga num só lugar. */

import type { FlagKey } from "@/lib/flags";

export const SWITCH_KEYS = [
  "auto_publish",
  "read_only",
  "ai_enabled",
  "personalization_enabled",
  "image_reproduction_enabled",
  "source_link_analysis",
  "sponsored_native_enabled",
  "ads_enabled",
] as const satisfies readonly FlagKey[];

export interface SwitchInfo {
  title: string;
  /** O que a chave controla, em uma frase. */
  about: string;
  /** Efeito de ligada / desligada. */
  on: string;
  off: string;
}

export const SWITCH_INFO: Record<(typeof SWITCH_KEYS)[number], SwitchInfo> = {
  auto_publish: {
    title: "Publicação automática",
    about: "Deixa o motor publicar sozinho o que as regras aprovam.",
    on: "Ligada: publica dentro das regras.",
    off: "Desligada: tudo vai para a fila de revisão.",
  },
  read_only: {
    title: "Modo leitura",
    about: "Bloqueia toda gravação do Estúdio (incidente de banco ou segurança).",
    on: "Ligado: o Estúdio não grava nada.",
    off: "Desligado: o Estúdio grava normalmente.",
  },
  ai_enabled: {
    title: "Busca com IA",
    about: "Pergunte ao CityNews em /pergunte.",
    on: "Ligada: responde com fontes.",
    off: "Desligada: oferece a busca tradicional.",
  },
  personalization_enabled: {
    title: "Personalização",
    about: "Recomendação individual, só para quem consentiu.",
    on: "Ligada: quem consentiu recebe recomendações personalizadas.",
    off: "Desligada: todos veem a seleção editorial (peso individual zero).",
  },
  image_reproduction_enabled: {
    title: "Reprodução de imagem de terceiros",
    about: "Política reproduction: rótulo REPRODUÇÃO, crédito, link e remoção em 24 h.",
    on: "Ligada: imagens de fontes entram com crédito.",
    off: "Desligada: matérias saem sem imagem de terceiros.",
  },
  source_link_analysis: {
    title: "Análise de links de fontes",
    about: "Verifica os links das fontes antes de citar.",
    on: "Ligada: links são analisados.",
    off: "Desligada: links não são analisados.",
  },
  sponsored_native_enabled: {
    title: "Patrocinado nativo",
    about:
      "Matéria patrocinada na home, com o texto Patrocinado. Nunca em Política, Justiça, Segurança ou Saúde.",
    on: "Ligado: a matéria patrocinada aparece em Mais lidas da home.",
    off: "Desligado: matéria patrocinada só aparece na própria página.",
  },
  ads_enabled: {
    title: "Banners",
    about:
      "Campos de banner do portal (topo, lateral, no texto, rodapé). Nunca em Política, Justiça, Segurança ou Saúde.",
    on: "Ligado: os campos mostram as peças no ar, pagas ou da casa.",
    off: "Desligado: nenhum banner aparece no portal.",
  },
};

export const SWITCH_TEXT = {
  sectionLabel: "Administração",
  title: "Interruptores",
  intro:
    "Todas as chaves liga/desliga do sistema, com o estado atual e quem mudou por último. Cada mudança pede um motivo e fica na auditoria.",
  stateLabel: "Estado",
  onWord: "Ligado",
  offWord: "Desligado",
  turnOn: "Ligar",
  turnOff: "Desligar",
  missing: "Chave não encontrada no banco.",
  since: (who: string, when: string) => `desde ${when}, por ${who}`,
  unknownWho: "sistema",
  dialog: {
    title: (label: string, on: boolean) => `${on ? "Ligar" : "Desligar"} ${label}?`,
    reason: "Motivo",
    reasonHint: "Fica na auditoria.",
    reasonRequired: "Informe o motivo.",
    confirm: "Confirmar",
    cancel: "Cancelar",
  },
  result: {
    changed: (label: string, on: boolean) => `${label}: ${on ? "ligado" : "desligado"}.`,
    unchanged: "Já estava neste estado. Nada foi alterado.",
  },
  error: {
    forbidden: "Só a administração muda os interruptores.",
    generic: "Não foi possível aplicar a mudança. Tente de novo.",
  },
  others: {
    title: "Outras configurações",
    body: "Estas ficam em telas próprias:",
    items: [
      { label: "Pausa das notificações push", href: "/estudio/admin/notificacoes" },
      { label: "Exigir 2FA para a equipe", href: "/estudio/admin/seguranca" },
      { label: "Fontes ligadas e desligadas", href: "/estudio/control/fontes" },
      { label: "Regras de autonomia", href: "/estudio/control/regras" },
    ],
  },
  errorTitle: "Não foi possível carregar os interruptores",
  errorBody: "O banco não respondeu agora. Tente de novo em instantes.",
  retry: "Tentar de novo",
} as const;

/** Revisor automático (AUT-T6): modo `off`, `night` (20h às 6h em Cuiabá, padrão) ou `always`. */
export const REVIEWER_TEXT = {
  title: "Revisor automático",
  about:
    "Decide sozinho o que ficou em revisão além do prazo (urgente 10 min, demais 30 min): publicar, manter para uma pessoa ou arquivar, sempre com justificativa na decisão. Nunca decide correção, direito de resposta, denúncia nem mudança de regra, e respeita o orçamento de IA.",
  modes: {
    off: {
      label: "Desligado",
      about: "Tudo o que vence o prazo fica na fila para uma pessoa decidir.",
    },
    night: {
      label: "À noite",
      about: "Decide das 20h às 6h, horário de Cuiabá. Padrão.",
    },
    always: { label: "Sempre", about: "Decide a qualquer hora do dia." },
  },
  choose: (label: string) => `Usar o modo ${label}`,
  dialogTitle: (label: string) => `Mudar o revisor automático para "${label}"?`,
  result: (label: string) => `Revisor automático: ${label}.`,
} as const;
