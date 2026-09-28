import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo/jsonld";

/**
 * robots.txt: portal aberto; Estúdio, API, busca (resultados sem valor próprio) e vitrine do
 * design system fora do índice. Sitemap aponta para o índice.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/estudio",
          "/api/",
          "/busca",
          "/pergunte",
          "/design-system",
          "/entrar",
          "/criar-conta",
          "/recuperar-senha",
          "/redefinir-senha",
          "/confirmar",
          "/auth/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
