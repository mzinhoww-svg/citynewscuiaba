import type { Metadata } from "next";
import { SITE } from "@/content/pt-BR/site";

/**
 * Open Graph e Twitter por página (architecture §8). O Next substitui o `openGraph` do layout
 * pelo da página inteiro, então toda página leva também nome do site, idioma e imagem padrão.
 */
export const OG_IMAGE = { url: "/brand/citynews-horizontal.png", alt: SITE.name } as const;

export interface PageMetaInput {
  /** Título da página (sem o nome do site). */
  title: string;
  /** `<title>` completo, quando difere de "título · CityNews Cuiabá". */
  documentTitle?: string;
  description?: string;
  path: string;
  type?: "website" | "article";
  images?: string[];
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  noindex?: boolean;
}

export function pageMetadata(m: PageMetaInput): Metadata {
  const images = m.images?.length ? m.images.map((url) => ({ url })) : [OG_IMAGE];
  return {
    title: m.documentTitle ?? `${m.title} · ${SITE.name}`,
    description: m.description,
    alternates: { canonical: m.path },
    openGraph: {
      siteName: SITE.name,
      locale: "pt_BR",
      url: m.path,
      title: m.title,
      description: m.description,
      images,
      ...(m.type === "article"
        ? {
            type: "article" as const,
            publishedTime: m.publishedTime,
            modifiedTime: m.modifiedTime,
            section: m.section,
          }
        : { type: "website" as const }),
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.description },
    ...(m.noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
