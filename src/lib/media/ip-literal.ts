/** Host que é um endereço IP (v4 ou v6), não um nome: nunca vale como domínio da imagem. */
export const isIpLiteral = (host: string): boolean =>
  /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");
