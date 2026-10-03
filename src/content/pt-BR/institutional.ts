/**
 * Páginas institucionais (P24). Dados jurídicos e de contato ficam como `[PREENCHER]` até o
 * dono informar (B-001, A-014). Nada aqui promete prazo ou serviço que o produto não entrega.
 */
export const PENDING = "[PREENCHER]";

/** `false` para valor vazio, só espaços ou ainda pendente (`[PREENCHER]`): não vai à tela. */
export function isFilled(v: string): boolean {
  return v.trim() !== "" && !v.includes(PENDING);
}

export const REPLY = {
  metaTitle: "Direito de resposta · CityNews Cuiabá",
  metaDescription:
    "Peça direito de resposta a uma matéria do CityNews. Não precisa de conta; a redação responde por e-mail.",
  title: "Direito de resposta",
  intro:
    "Se uma matéria do CityNews citou você ou sua organização e você quer se manifestar, envie o pedido aqui. Não precisa de conta. A redação analisa cada pedido e responde por e-mail.",
  lawTitle: "Prazo e lei",
  lawNote:
    "O direito de resposta segue a Lei 13.188/2015. O prazo legal para pedir é de 60 dias a partir da publicação.",
  fields: {
    name: "Seu nome ou o da organização",
    email: "E-mail para resposta",
    article: "Link da matéria",
    reply: "Sua resposta",
    consent: "Autorizo o CityNews a usar estes dados só para analisar e responder este pedido.",
  },
  hints: {
    article: "Copie o endereço da página da matéria.",
    reply: "De 40 a 3.000 caracteres. Escreva o texto que você quer ver publicado.",
    email: "Usamos só para responder este pedido.",
  },
  placeholders: {
    name: "Ana Souza",
    email: "voce@exemplo.com",
    article: "https://…/materia/nome-da-materia",
  },
  errors: {
    name: "Informe seu nome. Exemplo: Ana Souza",
    email: "Confira o e-mail digitado. Exemplo: ana@exemplo.com",
    article: "Cole o link de uma matéria do CityNews. Exemplo: https://…/materia/nome-da-materia",
    articleNotFound:
      "Não encontramos essa matéria. Confira o link. Exemplo: https://…/materia/nome-da-materia",
    reply:
      "Escreva pelo menos 40 caracteres. Exemplo: explique o que está errado e o que você quer dizer.",
    replyLong: "A resposta passou de 3.000 caracteres. Resuma os pontos principais.",
    consent: "Marque a autorização para podermos responder.",
  },
  summary: (n: number) =>
    n === 1 ? "Corrija 1 campo para enviar." : `Corrija ${n} campos para enviar.`,
  submit: "Enviar pedido",
  sending: "Enviando…",
  rateLimited: "Muitos pedidos a partir desta conexão. Tente de novo em uma hora.",
  error: "Não conseguimos registrar agora. Tente de novo em alguns minutos.",
  success: "Recebemos seu pedido. A redação analisa e responde por e-mail em até 24 h.",
  honeypotLabel: "Não preencha este campo",
  backHome: "Voltar ao início",
} as const;

export interface DocSection {
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
}

export interface InstitutionalDoc {
  path: string;
  metaTitle: string;
  description: string;
  title: string;
  intro: string;
  sections: readonly DocSection[];
}

const meta = (title: string) => `${title} · CityNews Cuiabá`;

export const DOC_TEXT = {
  updated: "Versão de 27/09/2026",
  pendingNote:
    "Os campos marcados como [PREENCHER] aguardam dados oficiais da empresa e serão atualizados antes do lançamento.",
  related: "Veja também",
  breadcrumb: "Você está em",
  home: "Início",
} as const;

export const ABOUT: InstitutionalDoc = {
  path: "/sobre",
  metaTitle: meta("Sobre o CityNews"),
  description:
    "Quem faz o CityNews Cuiabá, o que publicamos e como mostramos a origem de cada notícia.",
  title: "Sobre o CityNews",
  intro:
    "O CityNews é um portal de notícias de Cuiabá e Várzea Grande. Reunimos reportagem própria, textos feitos a partir de outras fontes e links para outros veículos, sempre dizendo de onde veio cada informação.",
  sections: [
    {
      title: "O que você encontra aqui",
      items: [
        "Matérias da redação do CityNews, marcadas como ORIGINAL CITYNEWS.",
        "Textos próprios feitos a partir de fontes públicas e de outros veículos, identificados como “Feito a partir de” e o número de fontes, todas citadas.",
        "Links para matérias de outros veículos, marcados como AGREGADO. Nesses casos mostramos só o título, a data e, quando o veículo permite, um resumo curto escrito por nós. A leitura continua no site original.",
        "Agenda da cidade, serviços e assuntos acompanhados ao longo do tempo.",
      ],
    },
    {
      title: "Como trabalhamos",
      paragraphs: [
        "Reunimos informações de fontes cadastradas e de apuração própria. A redação acompanha o que vai ao ar e pode corrigir ou retirar qualquer publicação. Veja os detalhes em Como funciona o CityNews.",
        "Você não precisa de conta para ler, pesquisar, usar a agenda ou seguir fontes.",
      ],
    },
    {
      title: "Quem somos",
      items: [
        `Razão social: ${PENDING}`,
        `CNPJ: ${PENDING}`,
        `Endereço: Avenida São Sebastião, 1984, Cuiabá, Mato Grosso`,
        `Responsável editorial: ${PENDING}`,
      ],
    },
  ],
};

export const PRINCIPLES: InstitutionalDoc = {
  path: "/principios-editoriais",
  metaTitle: meta("Princípios editoriais"),
  description: "Os compromissos do CityNews com precisão, transparência, independência e correção.",
  title: "Princípios editoriais",
  intro:
    "Estes são os compromissos que valem para tudo o que o CityNews publica, feito por pessoas ou pelo sistema automático.",
  sections: [
    {
      title: "Origem sempre visível",
      paragraphs: [
        "Toda matéria mostra de onde veio: reportagem própria, texto feito a partir de outras fontes ou link para outro veículo. O rótulo nunca depende só da cor e aparece também para quem usa leitor de tela.",
      ],
    },
    {
      title: "Fonte antes de tudo",
      paragraphs: [
        "Publicamos com fontes identificadas. Informação que só uma fonte deu e que não pôde ser confirmada aparece como não confirmada. Quando as fontes discordam, mostramos a divergência em vez de escolher um lado sem explicar.",
      ],
    },
    {
      title: "Conteúdo de outros veículos",
      paragraphs: [
        "Não republicamos matérias de outros veículos. Mostramos título, data, um resumo de até duas frases escrito pelo CityNews quando o veículo permite e o link para o original.",
      ],
    },
    {
      title: "Temas sensíveis",
      paragraphs: [
        "Crimes, violência, mortes, acidentes, saúde de pessoas e eleições nunca são publicados sem revisão humana. Não usamos imagem gerada por IA para ilustrar esses temas e nunca geramos imagem realista de pessoa real.",
      ],
    },
    {
      title: "Correção pública",
      paragraphs: [
        "Erros são corrigidos na própria matéria, com nota visível e registro na página de correções. Versões anteriores ficam no histórico público de cada matéria.",
      ],
    },
    {
      title: "Independência comercial",
      paragraphs: [
        "Conteúdo pago é sempre identificado como PATROCINADO, nunca aparece em Política e não interfere na cobertura.",
      ],
    },
  ],
};

export const AI_USE: InstitutionalDoc = {
  path: "/como-usamos-ia",
  metaTitle: meta("Como usamos IA"),
  description:
    "O que a inteligência artificial faz e não faz no CityNews, e como a redação supervisiona.",
  title: "Como usamos IA",
  intro:
    "O CityNews usa inteligência artificial para coletar, organizar e resumir informações. Aqui explicamos o que ela faz, o que não faz e onde uma pessoa sempre entra.",
  sections: [
    {
      title: "O que a IA faz",
      items: [
        "Lê as fontes cadastradas a cada 30 minutos e agrupa as notícias sobre o mesmo fato.",
        "Classifica editoria e bairro, confere se há fonte oficial e se as fontes concordam.",
        "Escreve resumos curtos, que aparecem como Resumo em poucos segundos.",
        "Sugere títulos e imagens ilustrativas, que seguem as mesmas regras de rótulo.",
        "Responde perguntas na busca com IA, sempre citando as fontes.",
      ],
    },
    {
      title: "O que a IA não faz",
      items: [
        "Não publica sozinha temas sensíveis nem notícias urgentes.",
        "Não responde sem pelo menos duas fontes relevantes: quando não há, ela diz que não sabe.",
        "Não segue instruções escondidas em textos de terceiros: tudo o que é coletado é tratado como dado.",
        "Não cria imagem realista de pessoa real nem ilustra crime, tragédia ou saúde de alguém.",
      ],
    },
    {
      title: "Supervisão humana",
      paragraphs: [
        "Cada publicação automática segue regras públicas (veja a metodologia), registra por que foi publicada e pode ser desfeita por um editor em um clique. Enquanto o portal está em fase inicial, a revisão humana está ligada para todas as editorias.",
      ],
    },
  ],
};

export const PRIVACY: InstitutionalDoc = {
  path: "/privacidade",
  metaTitle: meta("Privacidade"),
  description:
    "Quais dados o CityNews usa, por quê, por quanto tempo e como exercer seus direitos (LGPD).",
  title: "Privacidade",
  intro:
    "Você pode usar o CityNews sem conta e sem ser rastreado. Esta página explica, em linguagem simples, o que coletamos e o que você controla.",
  sections: [
    {
      title: "Cookies e dados por categoria",
      items: [
        "Necessários (sempre ativos): sessão, segurança e a sua escolha de privacidade.",
        "Métricas agregadas (opcional): contagens de leitura sem identificador persistente.",
        "Personalização (opcional): histórico de leitura e identificador anônimo para recomendar fontes e matérias. Sem o seu aceite, nada é enviado com identificador.",
      ],
    },
    {
      title: "Formulários",
      paragraphs: [
        "Quando você informa um problema, sugere um evento, pede direito de resposta ou assina a newsletter, guardamos só o que está no formulário. O endereço IP é usado apenas como resumo criptográfico (hash) com sal que muda todo dia, para limitar abusos.",
      ],
    },
    {
      title: "Por quanto tempo",
      items: [
        "Eventos individuais de leitura: 90 dias; depois, só números agregados.",
        "Conversas com a busca com IA: 30 dias.",
        "Registros de auditoria da redação: 5 anos.",
      ],
    },
    {
      title: "Seus direitos (LGPD)",
      paragraphs: [
        "Você pode pedir acesso, correção, portabilidade e exclusão dos seus dados. Quem tem conta também pode exportar e excluir os dados no próprio perfil.",
      ],
      items: [
        `Encarregado de dados: ${PENDING}`,
        `E-mail para assuntos de dados: contato@citynews.com.br`,
      ],
    },
  ],
};

export const TERMS: InstitutionalDoc = {
  path: "/termos",
  metaTitle: meta("Termos de uso"),
  description: "Regras de uso do CityNews Cuiabá.",
  title: "Termos de uso",
  intro:
    "Ao usar o CityNews você concorda com estes termos. Eles valem para quem tem conta e para quem não tem.",
  sections: [
    {
      title: "Uso do conteúdo",
      paragraphs: [
        "O conteúdo próprio do CityNews pode ser compartilhado por link. A reprodução integral depende de autorização. O conteúdo de outros veículos pertence a eles e é acessado no site original.",
      ],
    },
    {
      title: "Contribuições de leitores",
      paragraphs: [
        "Sugestões de evento, avisos de problema e pedidos de direito de resposta são analisados pela redação, que pode não publicá-los. Não envie dados de terceiros sem autorização.",
      ],
    },
    {
      title: "Conta",
      paragraphs: [
        "A conta é opcional e serve para sincronizar preferências entre aparelhos. Você pode excluí-la quando quiser.",
      ],
    },
    {
      title: "Responsável",
      items: [`Razão social: ${PENDING}`, `CNPJ: ${PENDING}`, `Foro: ${PENDING}`],
    },
  ],
};

export const ADVERTISE: InstitutionalDoc = {
  path: "/anuncie",
  metaTitle: meta("Anuncie"),
  description: "Como anunciar no CityNews Cuiabá e as regras fixas para conteúdo patrocinado.",
  title: "Anuncie no CityNews",
  intro:
    "O CityNews aceita conteúdo patrocinado e campanhas de marca dentro de regras fixas, que protegem o leitor e a independência da redação.",
  sections: [
    {
      title: "Regras fixas",
      items: [
        "Todo conteúdo pago leva o rótulo PATROCINADO, visível e em texto.",
        "No máximo 1 item patrocinado a cada 6 itens em listas e recomendações.",
        "Nada patrocinado na editoria Política nem nas respostas do Perguntar ao CityNews.",
        "O anunciante não revisa nem altera a cobertura jornalística.",
      ],
    },
    {
      title: "Contato comercial",
      items: [`E-mail: contato@citynews.com.br`, `Telefone: ${PENDING}`],
    },
  ],
};

export const CONTACT: InstitutionalDoc = {
  path: "/contato",
  metaTitle: meta("Contato"),
  description: "Fale com a redação do CityNews: pautas, correções, direito de resposta e imprensa.",
  title: "Contato",
  intro: "Escolha o caminho mais rápido para o que você precisa. Nenhum deles exige conta.",
  sections: [
    {
      title: "Redação",
      items: [`E-mail da redação: contato@citynews.com.br`, `WhatsApp para pautas: ${PENDING}`],
    },
    {
      title: "Erro em uma matéria",
      paragraphs: [
        "Use o botão Informar problema na própria matéria. A redação responde em até 24 h.",
      ],
    },
    {
      title: "Veículos e fontes",
      paragraphs: [
        `Para pedir correção ou remoção de conteúdo agregado ou de imagem reproduzida, escreva para contato@citynews.com.br. Imagens reproduzidas saem do ar em até 24 h.`,
      ],
    },
    {
      title: "Endereço",
      items: [`Endereço: Avenida São Sebastião, 1984, Cuiabá, Mato Grosso`],
    },
  ],
};

/** Metodologia (confiança, rótulos, regras públicas): texto fixo; tabelas vêm do código. */
export const METHOD = {
  path: "/metodologia",
  metaTitle: meta("Metodologia"),
  description:
    "Como as matérias do CityNews são feitas, o que cada rótulo significa e as regras públicas de publicação.",
  title: "Metodologia",
  intro:
    "Aqui explicamos, em linguagem simples, como decidimos o que publicar e como mostramos isso para você.",
  howTitle: "Como as matérias são feitas",
  howIntro:
    "Cada matéria vem de fontes citadas, que aparecem na própria matéria com link para o original. Quando as fontes são outras, o texto diz de quantas veio. Reportagem própria da redação leva a marca ORIGINAL CITYNEWS, e links para outros veículos levam AGREGADO e o nome da fonte.",
  howItems: [
    "Erros são corrigidos na própria matéria, com nota visível e histórico de versões.",
    "Crime, violência, morte, saúde de pessoas e eleições passam sempre por revisão humana antes de ir ao ar.",
    "Conteúdo pago é identificado como Patrocinado.",
  ],
  labelsTitle: "O que cada rótulo significa",
  labelsIntro:
    "Cada card mostra até 4 rótulos. Os demais ficam no bloco De onde veio, dentro da matéria.",
  rulesTitle: "Regras de publicação automática",
  rulesIntro:
    "O sistema só publica sozinho quando a categoria permite e a informação cumpre os requisitos abaixo. Temas sensíveis e notícias urgentes sempre passam por uma pessoa. Nesta fase inicial, a revisão humana está ligada para todas as categorias.",
  rulesCaption: "Regras de autonomia por categoria (versão 1)",
  columns: {
    category: "Categoria",
    mode: "Modo",
    sources: "Mínimo de fontes",
    primary: "Exige fonte primária",
    image: "Exige imagem aprovada",
    score: "Pontuação mínima",
  },
  modes: {
    auto: "Automático",
    auto_notify: "Automático com aviso à redação",
    review: "Sempre revisado",
    blocked: "Nunca automático",
  },
  categories: {
    servicos: "Serviços",
    agenda: "Agenda",
    clima: "Clima",
    cidade: "Cidade",
    economia: "Economia",
    esportes: "Esportes",
    cultura: "Cultura",
    politica: "Política",
    saude: "Saúde",
    seguranca: "Segurança",
  } as Record<string, string>,
  yes: "Sim",
  no: "Não",
  none: "Não se aplica",
  sensitiveTitle: "Temas que sempre passam por revisão humana",
  sensitive:
    "Crime, violência, morte, tragédia, acidente, suicídio, abuso, saúde de pessoas e eleições.",
} as const;

export const CORRECTIONS_PAGE = {
  path: "/correcoes",
  metaTitle: meta("Correções"),
  description: "Lista pública de correções feitas em matérias do CityNews, com data e link.",
  title: "Correções",
  intro:
    "Quando erramos, corrigimos a matéria, deixamos uma nota visível e registramos aqui. As versões anteriores ficam no histórico de cada matéria.",
  listLabel: "Correções publicadas",
  kinds: { correction: "Correção", right_of_reply: "Direito de resposta" },
  published: "Publicada em",
  readArticle: (title: string) => `Ler a matéria: ${title}`,
  articleGone: "A matéria não está mais no ar.",
  empty: "Nenhuma correção publicada até agora",
  emptyText: "Quando uma matéria for corrigida, a correção aparece aqui com data e link.",
  errorTitle: "Não conseguimos carregar as correções agora",
  errorText: "Pode ser uma instabilidade passageira. Tente de novo em instantes.",
  retry: "Tentar de novo",
  report: "Encontrou um erro? Use Informar problema na matéria ou peça direito de resposta.",
  replyLink: "Pedir direito de resposta",
} as const;

/** Links institucionais relacionados, no fim de cada página. */
export const RELATED_LINKS = [
  { href: "/principios-editoriais", label: "Princípios editoriais" },
  { href: "/correcoes", label: "Correções" },
] as const;
