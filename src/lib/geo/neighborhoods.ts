/**
 * Dicionário de bairros de Cuiabá e Várzea Grande (etapa 9, "locate"). Só nomes distintivos:
 * bairros que são palavras comuns ("Popular", "Lixeira", "Manga", "Planalto") ficam de fora para
 * não gerar falso positivo; o agente `locate` cobre o resto e é validado contra esta lista.
 */

export type Municipality = "cuiaba" | "varzea-grande";
export type Locality = Municipality | "mt" | "nacional";

export interface Neighborhood {
  name: string;
  municipality: Municipality;
  /** Formas alternativas como aparecem em texto (acento e caixa não importam). */
  aliases?: string[];
  /** Nome é palavra comum: só os apelidos contam na busca em texto. */
  aliasesOnly?: boolean;
}

const cuiaba = (name: string, aliases?: string[], aliasesOnly = false): Neighborhood => ({
  name,
  municipality: "cuiaba",
  ...(aliases ? { aliases } : {}),
  ...(aliasesOnly ? { aliasesOnly } : {}),
});
const vg = (name: string, aliases?: string[]): Neighborhood => ({
  name,
  municipality: "varzea-grande",
  ...(aliases ? { aliases } : {}),
});

export const NEIGHBORHOODS: readonly Neighborhood[] = [
  // Cuiabá · região norte
  cuiaba("CPA I", ["CPA 1"]),
  cuiaba("CPA II", ["CPA 2"]),
  cuiaba("CPA III", ["CPA 3"]),
  cuiaba("CPA IV", ["CPA 4"]),
  cuiaba("CPA", ["Centro Político Administrativo"]),
  cuiaba("Morada da Serra"),
  cuiaba("Morada do Ouro"),
  cuiaba("Três Barras"),
  cuiaba("Paiaguás", ["Jardim Paiaguás"]),
  cuiaba("Novo Paraíso"),
  cuiaba("Jardim Vitória"),
  cuiaba("Nova Conquista"),
  cuiaba("Jardim Florianópolis"),
  cuiaba("Novo Horizonte"),
  cuiaba("Primeiro de Março", ["1º de Março"]),
  // Cuiabá · centro e região oeste
  cuiaba("Centro Norte"),
  cuiaba("Centro Sul"),
  cuiaba("Porto", ["bairro do Porto", "Orla do Porto"], true),
  cuiaba("Goiabeiras"),
  cuiaba("Duque de Caxias"),
  cuiaba("Araés"),
  cuiaba("Quilombo", ["bairro Quilombo", "bairro do Quilombo"], true),
  cuiaba("Santa Rosa", ["Jardim Santa Rosa"]),
  cuiaba("Santa Marta"),
  cuiaba("Cidade Alta"),
  cuiaba("Jardim Cuiabá"),
  cuiaba("Bosque da Saúde"),
  cuiaba("Consil"),
  cuiaba("Despraiado"),
  cuiaba("Jardim Itália"),
  cuiaba("Jardim das Américas"),
  cuiaba("Boa Esperança"),
  cuiaba("Dom Aquino"),
  cuiaba("Bandeirantes"),
  cuiaba("Poção"),
  cuiaba("Carumbé"),
  cuiaba("Ribeirão da Ponte"),
  cuiaba("Ribeirão do Lipa"),
  cuiaba("Jardim Leblon"),
  cuiaba("Coophamil"),
  cuiaba("Jardim Imperial"),
  cuiaba("Verdão", ["bairro Verdão", "bairro do Verdão"], true),
  cuiaba("Santa Isabel"),
  cuiaba("Grande Terceiro"),
  cuiaba("Areão"),
  cuiaba("Shangri-lá"),
  // Cuiabá · região sul (Coxipó)
  cuiaba("Coxipó", ["Coxipó da Ponte"]),
  cuiaba("Pedra 90", ["Pedra Noventa"]),
  cuiaba("Tijucal"),
  cuiaba("Osmar Cabral"),
  cuiaba("Pascoal Ramos"),
  cuiaba("Parque Cuiabá"),
  cuiaba("Jardim Presidente"),
  cuiaba("Altos do Coxipó"),
  cuiaba("Residencial Coxipó"),
  cuiaba("Distrito Industrial"),
  cuiaba("Jardim Industriário"),
  cuiaba("Tancredo Neves"),
  cuiaba("São Gonçalo Beira Rio", ["São Gonçalo"]),
  cuiaba("Parque Atalaia"),
  cuiaba("Jardim Passaredo"),
  cuiaba("Nova Esperança"),
  cuiaba("Dr. Fábio", ["Doutor Fábio"]),
  cuiaba("Jardim Aclimação"),
  // Várzea Grande
  vg("Cristo Rei"),
  vg("Jardim Glória"),
  vg("Mapim"),
  vg("Parque do Lago"),
  vg("Cohab Cristo Rei"),
  vg("Costa Verde", ["Jardim Costa Verde"]),
  vg("Água Limpa"),
  vg("Construmat"),
  vg("Ponte Nova"),
  vg("Capão Grande"),
  vg("Jardim Imperador"),
  vg("Nova Várzea Grande"),
  vg("Marajoara"),
  vg("Jardim dos Estados"),
  vg("Parque Del Rey"),
  vg("Jardim Aeroporto"),
  vg("Canelas"),
  vg("Santa Isabel II"),
  vg("Cabo Michel"),
  vg("Jardim Paula"),
  vg("Mapim II"),
];

const MUNICIPALITY_NAMES: [Locality, string[]][] = [
  ["varzea-grande", ["Várzea Grande"]],
  ["cuiaba", ["Cuiabá"]],
  [
    "mt",
    [
      "Chapada dos Guimarães",
      "Santo Antônio de Leverger",
      "Nossa Senhora do Livramento",
      "Rondonópolis",
      "Sinop",
      "Tangará da Serra",
      "Cáceres",
      "Barra do Garças",
      "Sorriso",
      "Lucas do Rio Verde",
      "Primavera do Leste",
      "Poconé",
    ],
  ],
];

/** Forma de comparação: sem acento, minúscula, só letras, números e espaços simples. */
export function normalizePlace(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/º/g, "o")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

interface Entry {
  key: string;
  neighborhood: Neighborhood;
}

/** Nomes e apelidos, os mais longos primeiro ("cpa iii" antes de "cpa"). */
const ENTRIES: Entry[] = NEIGHBORHOODS.flatMap((n) =>
  [...(n.aliasesOnly ? [] : [n.name]), ...(n.aliases ?? [])].map((k) => ({
    key: normalizePlace(k),
    neighborhood: n,
  })),
).sort((a, b) => b.key.length - a.key.length);

/** Todos os nomes, inclusive os de palavra comum (validação de respostas do agente). */
const BY_NAME: Entry[] = NEIGHBORHOODS.flatMap((n) =>
  [n.name, ...(n.aliases ?? [])].map((k) => ({ key: normalizePlace(k), neighborhood: n })),
);

const contains = (haystack: string, needle: string): boolean =>
  ` ${haystack} `.includes(` ${needle} `);

/** Bairro do dicionário pelo nome ou apelido (validação de respostas do agente). */
export function resolveNeighborhood(name: string): Neighborhood | null {
  const key = normalizePlace(name);
  return BY_NAME.find((e) => e.key === key)?.neighborhood ?? null;
}

export interface PlaceMatch {
  municipality: Locality | null;
  neighborhood: Neighborhood | null;
}

/**
 * Localiza o texto pelo dicionário: primeiro bairro citado (o nome mais longo vence) e município
 * citado. Bairro sem município citado define o município; município citado desempata bairros
 * homônimos.
 */
export function findPlace(text: string): PlaceMatch {
  const t = normalizePlace(text);
  let municipality: Locality | null = null;
  for (const [loc, names] of MUNICIPALITY_NAMES)
    if (names.some((n) => contains(t, normalizePlace(n)))) {
      municipality = loc;
      break;
    }

  let consumed = t;
  const hits: Neighborhood[] = [];
  for (const e of ENTRIES) {
    if (!contains(consumed, e.key)) continue;
    hits.push(e.neighborhood);
    consumed = ` ${consumed} `.replace(` ${e.key} `, " ").trim();
  }
  const neighborhood =
    hits.find((n) => municipality === null || n.municipality === municipality) ?? null;
  return {
    municipality: neighborhood && municipality === null ? neighborhood.municipality : municipality,
    neighborhood,
  };
}
