/**
 * Conta opcional (spec §5.4, docs/screens.md C01 a C06, P20, P23). Os textos marcados como fixos
 * são copiados literalmente do plano P2 (Global Constraints): não altere.
 */

/** C01 · Convite contextual (textos fixos). */
export const INVITE_TEXT = {
  title: "Quer manter suas fontes e notícias salvas em qualquer dispositivo?",
  create: "Criar conta",
  signIn: "Entrar",
  notNow: "Agora não",
  continueWithout: "Você pode continuar sem fazer login.",
  /** Quando a ação pedida exige conta (sincronizar, continuar conversa em outro aparelho). */
  requiresAccount:
    "Para sincronizar essa preferência entre dispositivos, é necessário entrar ou criar uma conta. Você pode continuar usando o CityNews sem cadastro.",
} as const;

/** P23 · Primeira visita (textos fixos nas ações e no título). */
export const FIRST_VISIT_TEXT = {
  region: "Personalizar fontes",
  title: "Personalize suas fontes e receba uma experiência mais relevante.",
  choose: "Escolher fontes agora",
  intro: "Escolha quem você quer acompanhar. Fica neste navegador, sem conta.",
  skip: "Agora não",
  account: "Entrar ou criar conta",
  pickerTitle: "Escolha as fontes que você quer acompanhar",
  pickerIntro: "Fica guardado neste navegador. Você pode mudar quando quiser em Favoritos.",
  groups: { local: "Locais", state: "Mato Grosso", theme: "Temáticas" },
  loading: "Carregando fontes",
  error: "Não conseguimos carregar as fontes agora.",
  retry: "Tentar de novo",
  seeAll: "Ver todas as fontes",
  done: "Concluir",
  followed: (n: number) =>
    n === 0
      ? "Nenhuma fonte escolhida."
      : n === 1
        ? "1 fonte seguida neste navegador."
        : `${n} fontes seguidas neste navegador.`,
} as const;

/** Partes comuns das telas de conta. */
export const ACCOUNT_TEXT = {
  email: "E-mail",
  emailPlaceholder: "Digite seu e-mail",
  emailError: "Confira o e-mail. Exemplo: ana@exemplo.com",
  password: "Senha",
  continueWithout: "Continuar sem login",
  /** Login e cadastro (UI-T12): a mesma saída, em botão de contorno ("Agora não"). */
  continueWithoutSignIn: "Continuar sem entrar",
  benefitsLabel: "O que a conta guarda para você",
  benefits: ["Salvos em todos os aparelhos", "Alertas do seu bairro", "Fontes que você segue"],
  optionalNote: "A conta é opcional: ler, buscar, ver a agenda e seguir fontes funcionam sem ela.",
  unavailable: "Não conseguimos falar com o serviço de contas agora. Tente de novo em instantes.",
  rateLimited: "Muitas tentativas a partir desta conexão. Tente de novo em uma hora.",
  or: "ou",
} as const;

/**
 * Convite de conta nas telas de Perfil, Favoritos e Alertas (UI-T14): por que criar conta, sem
 * tornar o login obrigatório. "Agora não" recolhe o convite neste navegador.
 */
export const ACCOUNT_INVITE_TEXT = {
  title: "Por que criar uma conta",
  intro: "Opcional: tudo continua funcionando sem conta. Com ela, o que você guarda vai junto.",
  create: "Criar conta",
  signIn: "Entrar",
  notNow: "Agora não",
  dismissed: "Tudo bem: você continua sem conta.",
} as const;

/** Botão do Google no login e no cadastro (UI-T12, spec de UI pública §4.7). */
export const GOOGLE_TEXT = {
  button: "Continuar com o Google",
  privacy: "Usamos seu nome e e-mail para criar a conta.",
  divider: "ou use seu e-mail",
} as const;

/** C02 · Entrar. */
export const SIGN_IN_TEXT = {
  metaTitle: "Entrar · CityNews Cuiabá",
  title: "Entrar na conta",
  intro: "Entre para manter suas fontes e notícias salvas em qualquer dispositivo.",
  passwordPlaceholder: "Digite sua senha",
  passwordError: "Digite sua senha.",
  forgot: "Esqueci a senha",
  submit: "Entrar",
  busy: "Entrando…",
  wrong: "E-mail ou senha incorretos",
  remaining: (n: number) =>
    n === 1
      ? "Resta 1 tentativa antes do bloqueio de 15 minutos."
      : `Restam ${n} tentativas antes do bloqueio de 15 minutos.`,
  locked: (time: string) =>
    `Muitas tentativas. Por segurança, o acesso com senha fica bloqueado até ${time}. Você pode entrar por link no e-mail ou redefinir a senha.`,
  notConfirmed: "Confirme seu e-mail antes de entrar.",
  resendConfirm: "Reenviar confirmação",
  /** Botão secundário compacto: envia um link de acesso para o e-mail digitado. */
  magicSubmit: "Entrar sem senha",
  magicSent: (email: string) =>
    `Se houver conta com ${email}, enviamos um link para entrar. Ele vale por 1 hora.`,
  noAccount: "Ainda não tem conta?",
  create: "Criar conta",
  noPermission:
    "Esta conta não tem acesso ao Estúdio. Entre com outra conta ou volte para o portal.",
  sessionExpired:
    "Sua sessão da equipe passou do tempo máximo definido pela administração. Entre de novo para continuar.",
} as const;

/** C03 · Criar conta. */
export const SIGN_UP_TEXT = {
  metaTitle: "Criar conta · CityNews Cuiabá",
  title: "Criar conta",
  intro: "Só pedimos o necessário. Suas fontes e salvos passam a valer em qualquer dispositivo.",
  name: "Nome de exibição",
  namePlaceholder: "Como você quer ser chamado",
  nameError: "Digite um nome de exibição (até 80 caracteres).",
  passwordPlaceholder: "Crie uma senha",
  passwordHint: "Pelo menos 8 caracteres. Misture letras, números e símbolos.",
  passwordError: "A senha precisa ter pelo menos 8 caracteres.",
  terms: "Li e aceito os Termos de uso e a Política de privacidade",
  termsLink: "Ler os termos",
  privacyLink: "Ler a política de privacidade",
  termsError: "Para criar a conta, aceite os termos.",
  newsletter: "Quero receber a newsletter Cuiabá em 5 minutos (opcional)",
  submit: "Criar conta",
  busy: "Criando conta…",
  exists: "Já existe uma conta com este e-mail. Entre ou recupere a senha.",
  checkEmail: (email: string) =>
    `Enviamos um link de confirmação para ${email}. Abra o e-mail para ativar a conta.`,
  resend: "Não recebeu? Reenviar link",
  recover: "Recuperar senha",
  hasAccount: "Já tem conta?",
  signIn: "Entrar",
} as const;

/** C04 · Recuperar e redefinir senha. */
export const RECOVER_TEXT = {
  metaTitle: "Recuperar senha · CityNews Cuiabá",
  title: "Recuperar senha",
  intro: "Digite o e-mail da conta. Enviamos um link para criar uma nova senha.",
  submit: "Enviar link",
  busy: "Enviando…",
  sent: "Se houver conta com este e-mail, enviamos um link",
  sentDetail: "Confira a caixa de entrada e o spam. O link vale por 1 hora.",
  back: "Voltar para entrar",
  resetMetaTitle: "Nova senha · CityNews Cuiabá",
  resetTitle: "Criar nova senha",
  resetIntro: "Escolha uma senha nova para a sua conta.",
  newPassword: "Nova senha",
  confirm: "Confirme a nova senha",
  confirmError: "As senhas não são iguais. Digite a mesma senha nos dois campos.",
  resetSubmit: "Salvar nova senha",
  resetBusy: "Salvando…",
  resetExpired: "Este link expirou ou já foi usado.",
  resetExpiredDetail: "Peça um novo link para redefinir a senha.",
  askAgain: "Pedir novo link",
  done: "Senha alterada. Você já está na sua conta.",
} as const;

/** C05 · Confirmar e-mail. */
export const CONFIRM_TEXT = {
  metaTitle: "Confirmar e-mail · CityNews Cuiabá",
  title: "Confirmar e-mail",
  pending: "Toque no botão para confirmar o seu e-mail.",
  submit: "Confirmar meu e-mail",
  busy: "Confirmando…",
  success: "E-mail confirmado",
  successDetail: "Sua conta está ativa.",
  continue: "Continuar",
  expired: "Este link expirou ou já foi usado",
  expiredDetail: "Digite seu e-mail para receber um novo link de confirmação.",
  already: "Este e-mail já está confirmado",
  alreadyDetail: "Você já pode entrar na conta.",
  check: "Confirme seu e-mail",
  checkDetail: "Abra o link que enviamos para ativar a conta. Pode levar alguns minutos.",
  resend: "Reenviar link",
  resent: "Se houver cadastro pendente com este e-mail, enviamos um novo link.",
  signIn: "Entrar",
} as const;

/** C06 · Migrar dados deste navegador para a conta. */
export const MIGRATE_TEXT = {
  metaTitle: "Levar seus dados para a conta · CityNews Cuiabá",
  title: "Levar o que está neste navegador para a sua conta?",
  intro:
    "Escolha o que levar. O que já estiver na conta fica como está e nada é duplicado. Neste navegador, tudo continua guardado.",
  loading: "Lendo o que está guardado neste navegador",
  entering: "Entrando…",
  legend: "O que levar",
  options: {
    follows: "Fontes, temas e alertas que você segue",
    saved: "Matérias salvas e coleções",
    interests: "Interesses e fontes ocultadas",
    history: "Histórico de leitura dos últimos 30 dias",
    conversations: "Conversas do Perguntar ao CityNews",
  },
  /** Avisos que acompanham a caixa (gate P2, I3). */
  hints: {
    history:
      "Leva também o identificador anônimo deste navegador: as leituras que ele registrou nos últimos 90 dias passam a ficar ligadas à sua conta.",
  } as Partial<Record<"follows" | "saved" | "interests" | "history" | "conversations", string>>,
  count: (n: number) => (n === 1 ? "1 item" : `${n} itens`),
  noConversations: "Nenhuma conversa guardada neste navegador.",
  submit: "Levar selecionados",
  busy: "Sincronizando…",
  fresh: "Começar do zero",
  freshNote: "Começar do zero não apaga nada deste navegador.",
  done: "Pronto",
  continue: "Continuar",
  error: "Não conseguimos sincronizar agora. Nada foi perdido: tente de novo.",
  retry: "Tentar de novo",
} as const;

/** P20 · Perfil. */
export const PROFILE_TEXT = {
  metaTitle: "Perfil · CityNews Cuiabá",
  title: "Perfil",
  description: "Seu perfil neste navegador e, se quiser, sua conta para sincronizar.",
  loading: "Carregando seu perfil",
  loadError: "Não conseguimos carregar os dados da sua conta agora",
  loadErrorDetail: "Suas escolhas neste navegador continuam aqui. Tente de novo em instantes.",
  retry: "Tentar de novo",
  anon: {
    title: "Seu perfil neste navegador",
    intro: "Sem conta, o CityNews guarda suas escolhas só aqui. Nada disso exige cadastro.",
    localId: "Identificador local",
    noId: "Sem identificador (personalização desligada)",
    createdAt: "Criado em",
    counts: "Guardado aqui",
    count: {
      follows: (n: number) =>
        n === 1 ? "1 fonte ou tema seguido" : `${n} fontes e temas seguidos`,
      saved: (n: number) => (n === 1 ? "1 matéria salva" : `${n} matérias salvas`),
      alerts: (n: number) => (n === 1 ? "1 alerta" : `${n} alertas`),
      collections: (n: number) => (n === 1 ? "1 coleção" : `${n} coleções`),
    },
    loss: "Se você limpar os dados do navegador ou trocar de aparelho, isto se perde.",
    create: "Criar conta para sincronizar",
    signIn: "Entrar",
    export: "Baixar dados deste navegador",
  },
  shortcuts: "Atalhos",
  links: {
    favorites: "Favoritos",
    alerts: "Alertas",
    privacy: "Privacidade e recomendações",
    newsletter: "Newsletters",
    app: "Baixar o app",
  },
  account: {
    title: "Sua conta",
    name: "Nome de exibição",
    email: "E-mail",
    neighborhood: "Bairro principal",
    neighborhoodHint: "Usado em Perto de você. Opcional.",
    none: "Não informar",
    save: "Salvar dados",
    saved: "Dados salvos.",
    nameError: "Digite um nome de exibição (até 80 caracteres). Exemplo: Ana Cuiabana",
  },
  sessions: {
    title: "Sessões",
    current: "Este navegador",
    since: (when: string) => `Última entrada ${when}`,
    note: "Para encerrar o acesso em outros aparelhos, saia de todos os dispositivos.",
    signOut: "Sair",
    signOutAll: "Sair de todos os dispositivos",
    signedOut: "Você saiu da conta. Suas escolhas neste navegador continuam aqui.",
  },
  password: {
    title: "Alterar senha",
    changed: "Senha alterada. Você continua na sua conta.",
    submit: "Alterar senha",
  },
  data: {
    title: "Seus dados",
    intro:
      "Baixe uma cópia do que a conta guarda: perfil, fontes, salvos, alertas, coleções e preferências.",
    export: "Exportar dados",
    exporting: "Preparando…",
    exportError: "Não conseguimos preparar o arquivo agora. Tente de novo.",
  },
  delete: {
    title: "Excluir conta",
    intro:
      "A exclusão vale depois de 7 dias. Até lá, você pode cancelar. Os dados deste navegador não são apagados.",
    open: "Excluir conta",
    dialogTitle: "Excluir sua conta?",
    dialogBody:
      "Fontes, salvos, alertas, coleções e preferências da conta serão apagados em 7 dias.",
    type: "Digite EXCLUIR para confirmar",
    word: "EXCLUIR",
    confirm: "Excluir conta",
    cancel: "Cancelar",
    scheduled: (date: string) => `Exclusão agendada para ${date}.`,
    scheduledDetail: "Até lá, a conta continua funcionando e você pode desistir.",
    undo: "Cancelar exclusão",
    undone: "Exclusão cancelada. Sua conta continua ativa.",
    staff: "Contas da equipe são removidas pela administração do CityNews.",
    error: "Não conseguimos registrar agora. Tente de novo.",
  },
} as const;
