import { siteUrl } from "@/lib/seo/jsonld";
import { SITE } from "@/content/pt-BR/site";

/**
 * Dados estruturados do Guia (GUIA-T6): `ItemList` para a lista e `LocalBusiness` para o lugar.
 * Funções puras. Nota e contagem do TripAdvisor não viram `aggregateRating`: avaliação de terceiros
 * não pode ser marcada como se fosse nossa (diretrizes de dados estruturados dos buscadores).
 */
type Ld = Record<string, unknown>;

export interface GuideListLdInput {
  slug: string;
  title: string;
  updatedAt: string;
  items: { position: number; name: string; slug: string }[];
}

export function guideListJsonLd(l: GuideListLdInput, base: string = siteUrl()): Ld {
  const url = `${base}/guia-cuiaba/${l.slug}`;
  const items = [...l.items].sort((a, b) => a.position - b.position);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: l.title,
    url,
    inLanguage: "pt-BR",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: items.length,
    dateModified: l.updatedAt,
    itemListElement: items.map((i) => ({
      "@type": "ListItem",
      position: i.position,
      name: i.name,
      url: `${base}/guia-cuiaba/lugar/${i.slug}`,
    })),
    isPartOf: { "@type": "WebSite", name: SITE.name, url: `${base}/` },
  };
}

/** Tipo schema.org mais específico para a categoria do Guia. */
export const SCHEMA_TYPE: Record<string, string> = {
  padaria: "Bakery",
  cafeteria: "CafeOrCoffeeShop",
  restaurante: "Restaurant",
  pizzaria: "Restaurant",
  hamburgueria: "FastFoodRestaurant",
  churrascaria: "Restaurant",
  sorveteria: "IceCreamShop",
  bar: "BarOrPub",
  lanchonete: "FastFoodRestaurant",
  hotel: "Hotel",
  museu: "Museum",
  parque: "Park",
};

export interface VenueLdInput {
  slug: string;
  name: string;
  category: string;
  address: string | null;
  neighborhood: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  hours: string | null;
  lat: number | null;
  lng: number | null;
  /** Fotos oficiais aprovadas (caminhos do próprio site). */
  images: string[];
}

const DAY = "(?:Mo|Tu|We|Th|Fr|Sa|Su)";
/** `Mo-Sa 06:00-20:00` e `Mo,We 08:00-12:00` valem em schema.org; texto livre do OSM, não. */
const HOURS = new RegExp(`^${DAY}(?:[-,]${DAY})* \\d{2}:\\d{2}-\\d{2}:\\d{2}$`);

export function validHours(raw: string | null): string[] {
  if (!raw) return [];
  const parts = raw.split(";").map((p) => p.trim());
  return parts.every((p) => HOURS.test(p)) ? parts : [];
}

export function venueJsonLd(v: VenueLdInput, base: string = siteUrl()): Ld {
  const hours = validHours(v.hours);
  const same = [v.website, v.instagram].filter((x): x is string => !!x);
  return {
    "@context": "https://schema.org",
    "@type": SCHEMA_TYPE[v.category] ?? "LocalBusiness",
    name: v.name,
    url: `${base}/guia-cuiaba/lugar/${v.slug}`,
    address: {
      "@type": "PostalAddress",
      ...(v.address ? { streetAddress: v.address } : {}),
      addressLocality: "Cuiabá",
      addressRegion: "MT",
      addressCountry: "BR",
      ...(v.neighborhood ? { areaServed: v.neighborhood } : {}),
    },
    ...(v.phone ? { telephone: v.phone } : {}),
    ...(v.lat !== null && v.lng !== null
      ? { geo: { "@type": "GeoCoordinates", latitude: v.lat, longitude: v.lng } }
      : {}),
    ...(hours.length > 0 ? { openingHours: hours } : {}),
    ...(v.images.length > 0
      ? { image: v.images.map((i) => new URL(i, `${base}/`).toString()) }
      : {}),
    ...(same.length > 0 ? { sameAs: same } : {}),
  };
}
