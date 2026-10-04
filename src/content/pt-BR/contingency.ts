/** Textos da Contingência (A15, P5-T10). */

export const CONTINGENCY_ACTIONS = [
  "pause_auto_publish",
  "resume_auto_publish",
  "read_only_on",
  "read_only_off",
  "ai_off",
  "ai_on",
  "rollback_rules",
] as const;
export type ContingencyAction = (typeof CONTINGENCY_ACTIONS)[number];

/** Nome exato que a pessoa digita para confirmar (Global Constraints do P5). */
export const ACTION_NAME: Record<ContingencyAction, string> = {
  pause_auto_publish: "PAUSAR PUBLICAÇÃO AUTOMÁTICA",
  resume_auto_publish: "RETOMAR PUBLICAÇÃO AUTOMÁTICA",
  read_only_on: "MODO LEITURA",
  read_only_off: "SAIR DO MODO LEITURA",
  ai_off: "DESLIGAR BUSCA COM IA",
  ai_on: "LIGAR BUSCA COM IA",
  rollback_rules: "ROLLBACK DE REGRAS",
};

export const ACTION_LABEL: Record<ContingencyAction, string> = {
  pause_auto_publish: "Pausar publicação automática",
  resume_auto_publish: "Retomar publicação automática",
  read_only_on: "Ativar modo leitura",
  read_only_off: "Sair do modo leitura",
  ai_off: "Desligar busca com IA",
  ai_on: "Ligar busca com IA",
  rollback_rules: "Rollback de regras",
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const CONTINGENCY_TEXT = {
  sectionLabel: "Governança",
  title: "Contingência",
  intro:
    "Botões de emergência. Cada um pede a confirmação digitando o nome da ação, vale na hora e fica na auditoria com o motivo. O runbook de cada um explica o que acontece e como voltar ao normal.",
  runbook: "Runbook",
  stateLabel: "Estado atual",
  since: (who: string, when: string) => `desde ${when}, por ${who}`,
  unknownWho: "sistema",
  cards: {
    auto_publish: {
      title: "Publicação automática",
      on: "Ligada: as categorias em modo automático publicam sozinhas (dentro das regras).",
      off: "Pausada: tudo o que as regras mandariam publicar vai para a fila de revisão.",
      pauseBody:
        "Pausa a etapa de publicação. Itens do ciclo em andamento que já tinham decisão de publicar vão para revisão; nada é despublicado.",
      resumeBody:
        "Religa a publicação automática na hora e zera o disjuntor. Fica registrado na auditoria.",
      runbook:
        "https://github.com/mzinhoww-svg/citynewscuiaba/blob/main/docs/runbooks/pausar-automatico.md",
    },
    read_only: {
      title: "Modo leitura",
      on: "Ligado: o Estúdio não grava nada; o portal serve o cache.",
      off: "Desligado: o Estúdio grava normalmente.",
      onBody:
        "Bloqueia todas as Server Actions do Estúdio com uma mensagem. O portal continua servindo o que já está publicado. Use em incidente de banco ou de segurança.",
      offBody: "Volta a permitir escrita no Estúdio.",
      runbook:
        "https://github.com/mzinhoww-svg/citynewscuiaba/blob/main/docs/runbooks/modo-leitura.md",
    },
    ai_enabled: {
      title: "Busca com IA",
      on: "Ligada: /pergunte responde com fontes.",
      off: "Desligada: /pergunte mostra “indisponível” e oferece a busca tradicional.",
      offBody:
        "Desliga o Pergunte ao CityNews. A busca tradicional e o pipeline continuam. Use quando o provedor falha ou a resposta sai errada.",
      onBody: "Religa a busca com IA.",
      runbook: "https://github.com/mzinhoww-svg/citynewscuiaba/blob/main/docs/runbooks/ia-fora.md",
    },
    rules: {
      title: "Regras de autonomia",
      state: (v: number, prev: number | null) =>
        prev === null
          ? `Versão ativa v${v}; não há versão aprovada anterior para voltar.`
          : `Versão ativa v${v}; o rollback volta para a v${prev}.`,
      body: "Reativa a versão aprovada anterior (já passou por aprovação registrada). A versão atual fica inativa e pode ser proposta de novo.",
      runbook:
        "https://github.com/mzinhoww-svg/citynewscuiaba/blob/main/docs/runbooks/rollback-regras.md",
    },
  },
  restore: {
    title: "Restauração de backup",
    body: "Não é um botão: segue o runbook de restauração (PITR + pg_dump diário).",
    runbook: "https://github.com/mzinhoww-svg/citynewscuiaba/blob/main/docs/runbooks/restore.md",
  },
  dialog: {
    title: (label: string) => `${label}?`,
    reason: "Motivo",
    reasonHint: "Fica na auditoria e nas notificações da equipe.",
    reasonRequired: "Informe o motivo.",
    typeLabel: (name: string) => `Digite ${name} para confirmar`,
    mismatch: "O texto não confere com o nome da ação.",
    confirm: "Confirmar",
    cancel: "Cancelar",
  },
  result: {
    pause_auto_publish: (moved: number) =>
      moved === 0
        ? "Publicação automática pausada. Nenhum item do ciclo em andamento precisou ir para revisão."
        : `Publicação automática pausada. ${moved} ${plural(moved, "item do ciclo em andamento foi", "itens do ciclo em andamento foram")} para revisão.`,
    resume_auto_publish: "Publicação automática religada. O disjuntor foi zerado.",
    read_only_on: "Modo leitura ligado. O Estúdio não grava nada até ser desligado aqui.",
    read_only_off: "Modo leitura desligado.",
    ai_off: "Busca com IA desligada. /pergunte oferece a busca tradicional.",
    ai_on: "Busca com IA ligada.",
    rollback_rules: (from: number, to: number) => `Regras voltaram da v${from} para a v${to}.`,
    unchanged: "Já estava neste estado. Nada foi alterado.",
  },
  error: {
    typed: "Confirme digitando o nome exato da ação.",
    forbidden: "Só a administração usa a contingência.",
    needs_approval: "Esta mudança exige aprovação registrada de quem tem o papel de aprovar.",
    no_previous: "Não há versão aprovada anterior para voltar.",
    rollback_loosens:
      "A versão anterior é mais frouxa que a ativa (revisão, temas sensíveis ou exigências menores). Rollback direto não vale: proponha essa versão como nova em Regras.",
    generic: "Não foi possível aplicar a ação. Tente de novo.",
    pending: "Já existe um pedido aberto para retomar a publicação automática.",
  },
  errorTitle: "Não foi possível carregar a contingência",
  errorBody: "O banco não respondeu agora. Tente de novo em instantes.",
  retry: "Tentar de novo",
} as const;
