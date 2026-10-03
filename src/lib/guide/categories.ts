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
  },
  {
    slug: "cafeteria",
    gender: "f",
    singular: "cafeteria",
    noun: "cafeterias",
    osm: ['["amenity"="cafe"]'],
    tripadvisor: "restaurants",
    taQuery: "cafeteria",
  },
  {
    slug: "restaurante",
    gender: "m",
    singular: "restaurante",
    noun: "restaurantes",
    osm: ['["amenity"="restaurant"]'],
    tripadvisor: "restaurants",
    taQuery: "restaurante",
  },
  {
    slug: "pizzaria",
    gender: "f",
    singular: "pizzaria",
    noun: "pizzarias",
    osm: ['["amenity"~"restaurant|fast_food"]["cuisine"~"pizza"]'],
    tripadvisor: "restaurants",
    taQuery: "pizzaria",
  },
  {
    slug: "hamburgueria",
    gender: "f",
    singular: "hamburgueria",
    noun: "hamburguerias",
    osm: ['["amenity"~"restaurant|fast_food"]["cuisine"~"burger"]'],
    tripadvisor: "restaurants",
    taQuery: "hamburgueria",
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
  },
  {
    slug: "sorveteria",
    gender: "f",
    singular: "sorveteria",
    noun: "sorveterias",
    osm: ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'],
    tripadvisor: "restaurants",
    taQuery: "sorveteria",
  },
  {
    slug: "bar",
    gender: "m",
    singular: "bar",
    noun: "bares",
    osm: ['["amenity"~"bar|pub|biergarten"]'],
    tripadvisor: "restaurants",
    taQuery: "bar",
  },
  {
    slug: "lanchonete",
    gender: "f",
    singular: "lanchonete",
    noun: "lanchonetes",
    osm: ['["amenity"="fast_food"]'],
    tripadvisor: "restaurants",
    taQuery: "lanchonete",
  },
  {
    slug: "hotel",
    gender: "m",
    singular: "hotel",
    noun: "hotéis",
    osm: ['["tourism"~"hotel|hostel|guest_house"]'],
    tripadvisor: "hotels",
    taQuery: "hotel",
  },
  {
    slug: "museu",
    gender: "m",
    singular: "museu",
    noun: "museus",
    osm: ['["tourism"="museum"]'],
    tripadvisor: "attractions",
    taQuery: "museu",
  },
  {
    slug: "parque",
    gender: "m",
    singular: "parque",
    noun: "parques",
    osm: ['["leisure"~"park|nature_reserve"]["name"]'],
    tripadvisor: "attractions",
    taQuery: "parque",
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
}

export const CUISINES: readonly Cuisine[] = [
  { slug: "italiana", label: "italiana", osm: "italian|pasta", taQuery: "italiano" },
  { slug: "japonesa", label: "japonesa", osm: "japanese|sushi", taQuery: "japonês sushi" },
  { slug: "arabe", label: "árabe", osm: "arab|lebanese|middle_eastern", taQuery: "árabe" },
  { slug: "regional", label: "regional", osm: "regional|brazilian", taQuery: "comida regional" },
  { slug: "peixe", label: "de peixe", osm: "fish|seafood", taQuery: "peixe" },
  { slug: "vegetariana", label: "vegetariana", osm: "vegetarian|vegan", taQuery: "vegetariano" },
];

export function cuisineBySlug(slug: string | null | undefined): Cuisine | undefined {
  return CUISINES.find((c) => c.slug === slug);
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
