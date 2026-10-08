/**
 * Categorias do Guia e como cada provedor as enxerga. `osm` são cláusulas de Overpass
 * (`nwr<cláusula>(area)`); `tripadvisor` é a categoria da Content API e `taQuery` o termo de busca.
 */

export interface GuideCategory {
  slug: string;
  singular: string;
  /** Plural para os textos ("padarias"). */
  noun: string;
  /** Gênero do substantivo, para o artigo do título ("As melhores padarias", "Os melhores bares"). */
  gender: "f" | "m";
  osm: readonly string[];
  tripadvisor: "restaurants" | "attractions" | "hotels" | null;
  taQuery: string;
  /**
   * Tipos da Places API (New) aceitos como `primaryType` do lugar; o primeiro vai na busca
   * (`includedType`). Evita hotel em padarias e barbearia em cafeterias (A-210).
   */
  googleTypes: readonly string[];
}

export const CATEGORIES: readonly GuideCategory[] = [
  {
    slug: "padaria",
    gender: "f",
    singular: "padaria",
    noun: "padarias",
    osm: ['["shop"="bakery"]'],
    tripadvisor: "restaurants",
    taQuery: "padaria",
    googleTypes: ["bakery"],
  },
  {
    slug: "cafeteria",
    gender: "f",
    singular: "cafeteria",
    noun: "cafeterias",
    osm: ['["amenity"="cafe"]'],
    tripadvisor: "restaurants",
    taQuery: "cafeteria",
    googleTypes: ["coffee_shop", "cafe", "tea_house"],
  },
  {
    slug: "restaurante",
    gender: "m",
    singular: "restaurante",
    noun: "restaurantes",
    osm: ['["amenity"="restaurant"]'],
    tripadvisor: "restaurants",
    taQuery: "restaurante",
    googleTypes: ["restaurant"],
  },
  {
    slug: "pizzaria",
    gender: "f",
    singular: "pizzaria",
    noun: "pizzarias",
    osm: ['["amenity"~"restaurant|fast_food"]["cuisine"~"pizza"]'],
    tripadvisor: "restaurants",
    taQuery: "pizzaria",
    googleTypes: ["pizza_restaurant"],
  },
  {
    slug: "hamburgueria",
    gender: "f",
    singular: "hamburgueria",
    noun: "hamburguerias",
    osm: ['["amenity"~"restaurant|fast_food"]["cuisine"~"burger"]'],
    tripadvisor: "restaurants",
    taQuery: "hamburgueria",
    googleTypes: ["hamburger_restaurant"],
  },
  {
    slug: "churrascaria",
    gender: "f",
    singular: "churrascaria",
    noun: "churrascarias",
    osm: [
      '["amenity"="restaurant"]["cuisine"~"steak_house|barbecue|churrasco|brazilian_steakhouse"]',
    ],
    tripadvisor: "restaurants",
    taQuery: "churrascaria",
    googleTypes: ["barbecue_restaurant", "steak_house", "brazilian_restaurant"],
  },
  {
    slug: "sorveteria",
    gender: "f",
    singular: "sorveteria",
    noun: "sorveterias",
    osm: ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'],
    tripadvisor: "restaurants",
    taQuery: "sorveteria",
    googleTypes: ["ice_cream_shop"],
  },
  {
    slug: "bar",
    gender: "m",
    singular: "bar",
    noun: "bares",
    osm: ['["amenity"~"bar|pub|biergarten"]'],
    tripadvisor: "restaurants",
    taQuery: "bar",
    googleTypes: ["bar", "pub", "wine_bar", "bar_and_grill"],
  },
  {
    slug: "lanchonete",
    gender: "f",
    singular: "lanchonete",
    noun: "lanchonetes",
    osm: ['["amenity"="fast_food"]'],
    tripadvisor: "restaurants",
    taQuery: "lanchonete",
    googleTypes: ["fast_food_restaurant", "sandwich_shop", "snack_bar"],
  },
  {
    slug: "hotel",
    gender: "m",
    singular: "hotel",
    noun: "hotéis",
    osm: ['["tourism"~"hotel|hostel|guest_house"]'],
    tripadvisor: "hotels",
    taQuery: "hotel",
    googleTypes: ["hotel", "lodging"],
  },
  {
    slug: "museu",
    gender: "m",
    singular: "museu",
    noun: "museus",
    osm: ['["tourism"="museum"]'],
    tripadvisor: "attractions",
    taQuery: "museu",
    googleTypes: ["museum"],
  },
  {
    slug: "parque",
    gender: "m",
    singular: "parque",
    noun: "parques",
    osm: ['["leisure"~"park|nature_reserve"]["name"]'],
    tripadvisor: "attractions",
    taQuery: "parque",
    googleTypes: ["park"],
  },
];

export function categoryBySlug(slug: string): GuideCategory | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

/** Cozinhas (subcategoria de restaurante): valor de `cuisine` no OSM e termo no TripAdvisor. */
export interface Cuisine {
  slug: string;
  label: string;
  osm: string;
  taQuery: string;
  /** Tipos de restaurante da Places API (New) para esta cozinha; o primeiro vai na busca. */
  googleTypes: readonly string[];
}

export const CUISINES: readonly Cuisine[] = [
  {
    slug: "italiana",
    label: "italiana",
    osm: "italian|pasta",
    taQuery: "italiano",
    googleTypes: ["italian_restaurant", "pizza_restaurant"],
  },
  {
    slug: "japonesa",
    label: "japonesa",
    osm: "japanese|sushi",
    taQuery: "japonês sushi",
    googleTypes: ["japanese_restaurant", "sushi_restaurant", "ramen_restaurant"],
  },
  {
    slug: "arabe",
    label: "árabe",
    osm: "arab|lebanese|middle_eastern",
    taQuery: "árabe",
    googleTypes: ["middle_eastern_restaurant", "lebanese_restaurant", "turkish_restaurant"],
  },
  {
    slug: "regional",
    label: "regional",
    osm: "regional|brazilian",
    taQuery: "comida regional",
    googleTypes: ["brazilian_restaurant"],
  },
  {
    slug: "peixe",
    label: "de peixe",
    osm: "fish|seafood",
    taQuery: "peixe",
    googleTypes: ["seafood_restaurant"],
  },
  {
    slug: "vegetariana",
    label: "vegetariana",
    osm: "vegetarian|vegan",
    taQuery: "vegetariano",
    googleTypes: ["vegetarian_restaurant", "vegan_restaurant"],
  },
];

export function cuisineBySlug(slug: string | null | undefined): Cuisine | undefined {
  return CUISINES.find((c) => c.slug === slug);
}

/**
 * O `primaryType` do Google cabe na categoria (e na cozinha, quando houver)? Restaurante sem
 * cozinha aceita qualquer tipo terminado em `_restaurant`. Sem tipo, não cabe.
 */
export function googleTypeMatches(
  category: string,
  subcategory: string | null | undefined,
  primaryType: string | null | undefined,
): boolean {
  if (!primaryType) return false;
  const cat = categoryBySlug(category);
  if (!cat) return false;
  const cuisine = cuisineBySlug(subcategory);
  if (cuisine) return cuisine.googleTypes.includes(primaryType);
  if (cat.slug === "restaurante") {
    return primaryType === "restaurant" || primaryType.endsWith("_restaurant");
  }
  return cat.googleTypes.includes(primaryType);
}

/** Tipo enviado na busca do Google (`includedType`): o da cozinha ou o da categoria. */
export function googleIncludedType(
  category: string,
  subcategory: string | null | undefined,
): string | null {
  return (
    cuisineBySlug(subcategory)?.googleTypes[0] ?? categoryBySlug(category)?.googleTypes[0] ?? null
  );
}

/** Cláusulas Overpass da categoria, estreitadas pela cozinha quando houver. */
export function osmClauses(category: string, subcategory?: string | null): string[] {
  const cat = categoryBySlug(category);
  if (!cat) return [];
  const cuisine = cuisineBySlug(subcategory);
  if (!cuisine) return [...cat.osm];
  return cat.osm.map((c) => `${c}["cuisine"~"${cuisine.osm}"]`);
}

/** Subcategoria (cozinha) do Guia a partir do valor `cuisine` do OSM. */
export function cuisineFromOsm(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value
    .toLowerCase()
    .split(/[;,]/)
    .map((p) => p.trim());
  for (const c of CUISINES) {
    const set = c.osm.split("|");
    if (parts.some((p) => set.includes(p))) return c.slug;
  }
  return null;
}
