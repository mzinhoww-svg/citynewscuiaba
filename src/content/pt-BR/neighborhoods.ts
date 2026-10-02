/**
 * Bairros e regiões usados nos filtros do portal (P02, P09). `slug` vai na URL (`?bairro=`);
 * `in` é a forma com preposição para frases ("no Coxipó", "na Morada da Serra").
 * Lista curada; a taxonomia editável chega no P5 (A05).
 */
export interface Neighborhood {
  slug: string;
  name: string;
  in: string;
}

export const NEIGHBORHOODS: readonly Neighborhood[] = [
  { slug: "boa-esperanca", name: "Boa Esperança", in: "na Boa Esperança" },
  { slug: "centro-norte", name: "Centro Norte", in: "no Centro Norte" },
  { slug: "centro-politico-administrativo", name: "Centro Político Administrativo", in: "no CPA" },
  { slug: "centro-sul", name: "Centro Sul", in: "no Centro Sul" },
  { slug: "coxipo", name: "Coxipó", in: "no Coxipó" },
  { slug: "cpa", name: "CPA", in: "no CPA" },
  { slug: "duque-de-caxias", name: "Duque de Caxias", in: "no Duque de Caxias" },
  { slug: "jardim-italia", name: "Jardim Itália", in: "no Jardim Itália" },
  { slug: "morada-da-serra", name: "Morada da Serra", in: "na Morada da Serra" },
  { slug: "pedra-90", name: "Pedra 90", in: "no Pedra 90" },
  { slug: "planalto", name: "Planalto", in: "no Planalto" },
  { slug: "porto", name: "Porto", in: "no Porto" },
  { slug: "quilombo", name: "Quilombo", in: "no Quilombo" },
  { slug: "tres-barras", name: "Três Barras", in: "no Três Barras" },
  { slug: "verdao", name: "Verdão", in: "no Verdão" },
  { slug: "varzea-grande", name: "Várzea Grande", in: "em Várzea Grande" },
];

export function neighborhoodBySlug(slug: string | undefined): Neighborhood | undefined {
  return slug ? NEIGHBORHOODS.find((n) => n.slug === slug) : undefined;
}
