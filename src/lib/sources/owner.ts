/**
 * "Conteúdo pertence à Folha do Cerrado" (P15). O cadastro de fontes não guarda o gênero do nome,
 * então a contração sai da primeira palavra; sem palavra conhecida (siglas, nomes próprios como
 * "MT Agora"), fica "a" sem artigo, que é sempre correto.
 */
const FEMININE = new Set([
  "folha",
  "rádio",
  "radio",
  "agência",
  "agencia",
  "cena",
  "gazeta",
  "tribuna",
  "revista",
  "tv",
  "rede",
  "voz",
  "página",
  "pagina",
  "hora",
  "notícia",
  "noticia",
  "assessoria",
  "prefeitura",
  "secretaria",
  "câmara",
  "camara",
  "assembleia",
  "rádio",
  "web",
  "plataforma",
]);
const MASCULINE = new Set([
  "diário",
  "diario",
  "portal",
  "correio",
  "jornal",
  "placar",
  "site",
  "blog",
  "canal",
  "estado",
  "boletim",
  "informativo",
  "governo",
  "ministério",
  "ministerio",
  "tribunal",
  "observatório",
  "agro",
]);

export function contractedArticle(name: string): "à" | "ao" | "a" {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (FEMININE.has(first)) return "à";
  if (MASCULINE.has(first)) return "ao";
  return "a";
}

export function belongsTo(name: string): string {
  return `Conteúdo pertence ${contractedArticle(name)} ${name}`;
}
