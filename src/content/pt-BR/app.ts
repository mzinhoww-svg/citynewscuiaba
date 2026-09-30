/**
 * Textos do app instalável (spec 2026-09-28 §7.2 C07, §7.3 C08, §7.9 P26).
 */
export const INSTALL_TEXT = {
  region: "Instalar o app",
  body: "Leia o CityNews como app: abre mais rápido e funciona sem internet.",
  install: "Instalar",
  notNow: "Agora não",
  installed: "Já instalado",
  /** Link no rodapé, no Explorar e no Perfil (P26). */
  link: "Baixar o app",
} as const;

export const IOS_STEPS_TEXT = {
  title: "Adicionar o CityNews à Tela de Início",
  step1Safari: "Toque em Compartilhar",
  step1Other: "Toque em Compartilhar na barra de endereço",
  step2: "Escolha Adicionar à Tela de Início",
  step3: "Toque em Adicionar",
  note: "Depois, abra o CityNews pela Tela de Início para receber avisos.",
  ok: "Entendi",
  notNow: "Agora não",
  shareIcon: "ícone Compartilhar",
} as const;

export const APP_PAGE_TEXT = {
  metaTitle: "Baixar o app · CityNews Cuiabá",
  title: "Baixar o app",
  description:
    "Instale o CityNews na tela inicial do celular ou do computador: abre mais rápido, funciona sem internet e avisa do que você segue.",
  intro:
    "O CityNews é um app de navegador: não passa por loja, não ocupa espaço à toa e continua sendo o mesmo site. Instalado, abre mais rápido, guarda o que você leu para ler sem internet e pode avisar do que você segue.",
  installNow: "Instalar",
  installed: "Já instalado",
  howTo: "Como instalar",
  platforms: [
    {
      id: "android",
      title: "Android (Chrome)",
      steps: [
        "Toque no menu do Chrome (três pontos).",
        "Escolha Instalar app ou Adicionar à tela inicial.",
        "Confirme em Instalar.",
      ],
    },
    {
      id: "ios",
      title: "iPhone e iPad (Safari)",
      steps: [
        "Toque em Compartilhar.",
        "Escolha Adicionar à Tela de Início.",
        "Toque em Adicionar. Depois, abra o CityNews pela Tela de Início para receber avisos.",
      ],
    },
    {
      id: "mac",
      title: "Mac (Safari)",
      steps: ["No menu Arquivo, escolha Adicionar ao Dock.", "Confirme em Adicionar."],
    },
    {
      id: "windows",
      title: "Windows (Chrome ou Edge)",
      steps: [
        "Clique no ícone de instalar na barra de endereço, ou no menu escolha Instalar CityNews.",
        "Confirme em Instalar.",
      ],
    },
    {
      id: "other",
      title: "Outros navegadores",
      steps: ["Seu navegador não permite instalar; use o site normalmente."],
    },
  ],
  whyTitle: "O que muda",
  why: [
    "Abre na tela inicial, sem a barra do navegador.",
    "A página inicial, as editorias e as últimas matérias lidas ficam guardadas para leitura sem internet.",
    "Avisos do que você segue e de urgências, se você ativar em Alertas.",
  ],
} as const;
