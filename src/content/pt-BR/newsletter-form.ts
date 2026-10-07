/**
 * Formulário curto de inscrição (home e rodapé). Módulo próprio, e não `portal.ts` nem
 * `newsletter.ts`, para o bundle do navegador não levar os textos da home nem os da página de
 * newsletters (B-018; item 85, A-156).
 */
export const NEWSLETTER = {
  title: "Receba a newsletter",
  intro: "O resumo do dia em Cuiabá, cedo, no seu e-mail. Só pedimos o endereço.",
  label: "E-mail",
  placeholder: "voce@exemplo.com",
  submit: "Inscrever",
  sending: "Enviando…",
  invalid: "Confira o e-mail digitado. Exemplo: ana@exemplo.com",
  rateLimited: "Muitas tentativas a partir desta conexão. Tente de novo em uma hora.",
  error: "Não conseguimos registrar agora. Tente de novo em alguns minutos.",
  success:
    "Inscrição recebida. Enviamos um link de confirmação para o seu e-mail; sem confirmação, nada é enviado. O envio das edições começa em breve.",
  privacy: "Você pode sair da lista a qualquer momento.",
  honeypotLabel: "Não preencha este campo",
  /** Legenda das listas (só na página de newsletters, que mostra a escolha). */
  listsLegend: "Quais newsletters?",
} as const;
