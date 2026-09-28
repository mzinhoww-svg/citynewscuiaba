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
  skip: "Continuar sem personalizar",
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
  close: "Fechar",
} as const;
