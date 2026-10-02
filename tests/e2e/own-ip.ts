import { randomInt } from "node:crypto";

/**
 * IP de teste próprio (x-forwarded-for) em 10.0.0.0/8: os limites de uso (5 denúncias/h,
 * 120 eventos/10 min, 20 perguntas/h…) valem por conexão. Com 16 milhões de endereços, dois
 * testes em paralelo não caem no mesmo IP (com /24 e 250 endereços, o teste que esgota o limite
 * derrubava outro de vez em quando).
 */
export function uniqueIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

/** Cabeçalho com o IP próprio seguido de um proxy (formato da Vercel). */
export function forwardedFor(): Record<string, string> {
  return { "x-forwarded-for": `${uniqueIp()}, 10.0.0.1` };
}
