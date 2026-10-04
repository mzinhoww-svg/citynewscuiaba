/**
 * Tags do cache de dados do Guia (`revalidateTag`). Módulo leve, sem dependências, para as páginas
 * públicas e o Estúdio usarem os mesmos nomes sem puxar o processamento de imagem.
 */
export const guideTags = {
  index: "guide",
  list: (slug: string) => `guide:list:${slug}`,
  venue: (slug: string) => `guide:venue:${slug}`,
} as const;
