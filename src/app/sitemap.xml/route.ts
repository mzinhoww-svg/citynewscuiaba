import { siteUrl } from "@/lib/seo/jsonld";
import { SITEMAP_CHILDREN, sitemapIndexXml, xmlResponse } from "@/lib/seo/sitemap";

/** Índice de sitemaps (architecture §8). */
export function GET() {
  return xmlResponse(sitemapIndexXml(SITEMAP_CHILDREN, siteUrl()), 3600);
}
