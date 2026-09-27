import { SITE } from "@/content/pt-BR/site";
import { toZonedIso } from "@/lib/format/date";

/**
 * Dados estruturados (architecture §8). Funções puras: recebem os dados já lidos e a URL base
 * do site. `siteUrl()` lê APP_URL (sem barra no fim).
 */
export function siteUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export interface ArticleLdInput {
  slug: string;
  title: string;
  dek: string;
  publishedAt: string;
  updatedAt: string;
  byline: string;
  /** Assinatura de pessoa (redação humana) ou da redação (agente). */
  authorIsPerson: boolean;
  section: { slug: string; name: string };
  image?: { src: string };
  sources: { url: string; title: string; name: string }[];
}

type Ld = Record<string, unknown>;

export function articleJsonLd(a: ArticleLdInput, base: string = siteUrl()): Ld {
  const url = `${base}/materia/${a.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: a.title,
    description: a.dek,
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    author: { "@type": a.authorIsPerson ? "Person" : "Organization", name: a.byline },
    publisher: {
      "@type": "Organization",
      name: SITE.name,
      logo: { "@type": "ImageObject", url: `${base}/icon.svg` },
    },
    articleSection: a.section.name,
    mainEntityOfPage: url,
    url,
    isAccessibleForFree: true,
    inLanguage: "pt-BR",
    ...(a.image ? { image: [a.image.src] } : {}),
    citation: a.sources.map((s) => ({ "@type": "CreativeWork", url: s.url, name: s.title })),
  };
}

export interface EventLdInput {
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  neighborhood: string | null;
  isFree: boolean;
  priceCents: number | null;
  description: string | null;
}

export function eventJsonLd(e: EventLdInput, base: string = siteUrl()): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: toZonedIso(e.startsAt),
    ...(e.endsAt ? { endDate: toZonedIso(e.endsAt) } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: e.venue,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Cuiabá",
        addressRegion: "MT",
        addressCountry: "BR",
        ...(e.neighborhood ? { streetAddress: e.neighborhood } : {}),
      },
    },
    ...(e.description ? { description: e.description } : {}),
    isAccessibleForFree: e.isFree,
    ...(e.isFree
      ? {}
      : {
          offers: {
            "@type": "Offer",
            price: ((e.priceCents ?? 0) / 100).toFixed(2),
            priceCurrency: "BRL",
          },
        }),
    url: `${base}/agenda/${e.slug}`,
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumbs: readonly Crumb[], base: string = siteUrl()): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: `${base}${c.path}`,
    })),
  };
}

/** Veículo (home): políticas públicas ligadas às páginas institucionais. */
export function organizationJsonLd(base: string = siteUrl()): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "NewsMediaOrganization",
    name: SITE.name,
    url: `${base}/`,
    logo: { "@type": "ImageObject", url: `${base}/brand/citynews-horizontal.png` },
    areaServed: { "@type": "City", name: "Cuiabá" },
    publishingPrinciples: `${base}/principios-editoriais`,
    correctionsPolicy: `${base}/correcoes`,
    ethicsPolicy: `${base}/principios-editoriais`,
    actionableFeedbackPolicy: `${base}/direito-de-resposta`,
  };
}

/** Site com busca interna (SearchAction para /busca?q=). */
export function websiteJsonLd(base: string = siteUrl()): Ld {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: `${base}/`,
    inLanguage: "pt-BR",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${base}/busca?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** JSON dentro de <script>: escapa "<" para não fechar a tag. */
export function ldScript(data: Ld): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
