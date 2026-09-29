import { createHash } from "node:crypto";

/**
 * Apelido do leitor no painel: prefixo de um hash com sal do produto. O id anônimo em si nunca
 * é exibido, gravado em log nem devolvido às telas do Estúdio.
 */
export function anonAlias(anonId: string): string {
  return `leitor-${createHash("sha256").update(`citynews-rec:${anonId}`).digest("hex").slice(0, 8)}`;
}
