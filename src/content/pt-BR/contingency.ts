import type { ContingencyKey, FlagKey } from "@/lib/flags/keys";

/** Textos da contingência (P5-T10; docs/screens.md A15). */
export const READ_ONLY_MESSAGE =
  "O Estúdio está em modo leitura: nenhuma alteração foi gravada. A administração libera em Contingência.";

export const FLAG_ERRORS = {
  forbidden: "Só a pessoa administradora muda as chaves de contingência.",
  invalid_key: "Chave desconhecida. Nada foi alterado.",
  approval_required:
    "Salvaguardas de segurança não são chaves: mudam pela versão de regras, com aprovação de outra pessoa (safety.disable).",
  unavailable: "Não foi possível gravar agora. Nada foi alterado.",
  no_change: "A chave já está nesse estado.",
} as const;

export const FLAG_LABELS: Record<FlagKey, string> = {
  auto_publish: "Publicação automática",
  read_only: "Modo leitura do Estúdio",
  ai_enabled: "IA (global)",
  image_reproduction_enabled: "Reprodução de imagem de terceiros",
  personalization_enabled: "Personalização",
  source_link_analysis: "Análise de link de fonte",
  sponsored_enabled: "Patrocínio",
};

export const CONTINGENCY = {
  title: "Contingência",
  intro:
    "Botões de emergência. Cada um pede que você digite o nome da ação e um motivo, grava quem mudou e quando, e tem um runbook com o passo a passo e a forma de reverter.",
  loading: "Carregando o estado das chaves",
  errorTitle: "Não foi possível carregar as chaves",
  errorBody: "O banco não respondeu. Nada foi alterado. Tente de novo em instantes.",
  retry: "Tentar de novo",
  adminOnly:
    "Só a pessoa administradora aciona estes botões. Você pode ver o estado e os runbooks.",
  stateTitle: "Estado atual",
  stateCaption: "Chaves de operação, quem mudou e quando",
  colFlag: "Chave",
  colState: "Estado",
  colBy: "Alterado por",
  colAt: "Quando",
  neverChanged: "Sem alteração registrada",
  unknownPerson: "Pessoa não identificada",
  on: "Ligada",
  off: "Desligada",
  actionsTitle: "Ações de emergência",
  reasonLabel: "Motivo (fica na auditoria)",
  reasonHint: "Explique em uma frase o que está acontecendo.",
  confirmLabel: "Digite o nome da ação para confirmar",
  cancel: "Cancelar",
  runbook: "Runbook",
  rollbackTitle: "Reverter regras",
  rollbackBody:
    "O rollback ativa de novo a versão anterior das regras e passa pela aprovação de outra pessoa. Este atalho leva à tela de regras; a ativação só vale depois da aprovação.",
  rollbackAction: "Abrir regras e aprovações",
  rollbackApprovals: "Aprovações pendentes",
  runbooksTitle: "Runbooks",
  runbooksIntro: "Passo a passo em pt-BR, com quem pode, como verificar e como reverter.",
  ok: {
    flag_set: "Chave alterada e registrada na auditoria.",
  },
  otherFlagsTitle: "Outras chaves (só leitura aqui)",
  otherFlagsBody:
    "Reprodução de imagem, personalização, análise de link e patrocínio têm tela própria: Governança da IA, Governança editorial e Publicidade.",
} as const;

export interface ContingencyAction {
  key: ContingencyKey;
  /** Valor que a ação grava. */
  value: boolean;
  /** Nome que a pessoa digita. */
  confirmText: string;
  button: string;
  title: string;
  intro: string;
  effect: string;
  revert: string;
  runbook: string;
  submit: string;
  done: string;
}

/** Ação de emergência e ação inversa de cada chave (o botão mostrado depende do estado). */
export const ACTIONS_BY_KEY: Record<
  ContingencyKey,
  { stop: ContingencyAction; resume: ContingencyAction }
> = {
  auto_publish: {
    stop: {
      key: "auto_publish",
      value: false,
      confirmText: "pausar publicação automática",
      button: "Pausar publicação automática",
      title: "Pausar publicação automática",
      intro:
        "A partir de agora nenhuma matéria publica sozinha. O ciclo em andamento continua, mas os itens que faltam vão para a fila de revisão.",
      effect: "Itens novos e restantes do ciclo: revisão humana.",
      revert: "Retomar a publicação automática pelo mesmo painel.",
      runbook: "pausar-automatico",
      submit: "Pausar publicação automática",
      done: "Publicação automática pausada. Os itens seguintes vão para revisão.",
    },
    resume: {
      key: "auto_publish",
      value: true,
      confirmText: "retomar publicação automática",
      button: "Retomar publicação automática",
      title: "Retomar publicação automática",
      intro: "As regras ativas voltam a decidir. Segurança e urgente continuam indo para revisão.",
      effect: "Só o que as regras liberam publica sozinho.",
      revert: "Pausar de novo pelo mesmo painel.",
      runbook: "pausar-automatico",
      submit: "Retomar publicação automática",
      done: "Publicação automática retomada.",
    },
  },
  read_only: {
    stop: {
      key: "read_only",
      value: true,
      confirmText: "ativar modo leitura",
      button: "Ativar modo leitura",
      title: "Ativar modo leitura do Estúdio",
      intro:
        "O Estúdio deixa de gravar: salvar, publicar, aprovar item e configurar ficam bloqueados com aviso. O portal público continua lendo. Esta tela continua liberada para desligar o modo.",
      effect: "Estúdio só lê. Publicação automática também para.",
      revert: "Desativar o modo leitura pelo mesmo painel.",
      runbook: "modo-leitura",
      submit: "Ativar modo leitura",
      done: "Modo leitura ativado. O Estúdio não grava até você desativar.",
    },
    resume: {
      key: "read_only",
      value: false,
      confirmText: "desativar modo leitura",
      button: "Desativar modo leitura",
      title: "Desativar modo leitura",
      intro: "O Estúdio volta a gravar normalmente.",
      effect: "Escrita liberada no Estúdio.",
      revert: "Ativar o modo leitura de novo.",
      runbook: "modo-leitura",
      submit: "Desativar modo leitura",
      done: "Modo leitura desativado.",
    },
  },
  ai_enabled: {
    stop: {
      key: "ai_enabled",
      value: false,
      confirmText: "desligar ia",
      button: "IA fora do ar",
      title: "Desligar a IA globalmente",
      intro:
        "Nenhum modelo é chamado. A busca com IA mostra indisponível e oferece a busca tradicional. O pipeline segue sem IA: rascunhos sem IA vão para revisão e nada publica sozinho.",
      effect: "Busca com IA indisponível; rascunhos sem IA em revisão.",
      revert: "Religar a IA pelo mesmo painel.",
      runbook: "ia-fora",
      submit: "Desligar a IA",
      done: "IA desligada. A busca tradicional segue no ar.",
    },
    resume: {
      key: "ai_enabled",
      value: true,
      confirmText: "religar ia",
      button: "Religar a IA",
      title: "Religar a IA",
      intro: "Os agentes ligados voltam a chamar os modelos, dentro dos orçamentos.",
      effect: "Busca com IA e pipeline com IA voltam.",
      revert: "Desligar a IA de novo.",
      runbook: "ia-fora",
      submit: "Religar a IA",
      done: "IA religada.",
    },
  },
};

export const RUNBOOKS = [
  { slug: "pausar-automatico", title: "Pausar a publicação automática" },
  { slug: "modo-leitura", title: "Modo leitura do Estúdio" },
  { slug: "ia-fora", title: "IA fora do ar" },
  { slug: "rollback-regras", title: "Reverter as regras de autonomia" },
  { slug: "restore", title: "Restaurar o banco a partir do backup" },
] as const;

export const RUNBOOK_BASE =
  "https://github.com/mzinhoww-svg/citynewscuiaba/blob/main/docs/runbooks";
