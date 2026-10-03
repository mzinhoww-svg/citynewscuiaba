/** Textos da página Interruptores (admin): todas as chaves liga/desliga num só lugar. */

import type { FlagKey } from "@/lib/flags";

export const SWITCH_KEYS = [
  "auto_publish",
  "read_only",
  "ai_enabled",
  "personalization_enabled",
  "image_reproduction_enabled",
  "source_link_analysis",
] as const satisfies readonly FlagKey[];

export interface SwitchInfo {
  title: string;
  /** O que a chave controla, em uma frase. */
  about: string;
  /** Efeito de ligada / desligada. */
  on: string;
  off: string;
  /** Ligar passa por aprovação de outra pessoa. */
  guarded?: boolean;
}

export const SWITCH_INFO: Record<(typeof SWITCH_KEYS)[number], SwitchInfo> = {
  auto_publish: {
    title: "Publicação automática",
    about: "Deixa o motor publicar sozinho o que as regras aprovam.",
    on: "Ligada: publica dentro das regras.",
    off: "Desligada: tudo vai para a fila de revisão.",
    guarded: true,
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
  guardedNote: "Religar abre um pedido para outra pessoa aprovar.",
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
    pending: "Pedido aberto. Outra pessoa (admin) precisa aprovar na caixa de aprovações.",
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
