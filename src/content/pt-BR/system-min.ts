/**
 * Textos de quando o pedaço de tela carregado sob demanda não chega (rede caiu). Ficam num módulo
 * à parte, mínimo, para não puxar `system.ts` inteiro para o bundle inicial (B-018).
 */
export const LOAD_FAILED = {
  title: "Não foi possível carregar agora",
  text: "Confira sua conexão e tente de novo.",
  retry: "Tentar de novo",
} as const;
