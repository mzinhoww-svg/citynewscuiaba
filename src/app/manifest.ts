import type { MetadataRoute } from "next";
import { SITE } from "@/content/pt-BR/site";
import { readCssToken } from "@/lib/theme/css-token";

/**
 * Manifesto do PWA (spec 2026-09-28 §7.10, D-P06). Cores lidas dos tokens no build; ícones da
 * marca gerados por `pnpm icons:build` (scripts/build-icons.mjs). `start_url` com `?origem=app`
 * só serve para detectar a primeira abertura instalada e é removido da URL pelo cliente.
 */
export default function manifest(): MetadataRoute.Manifest {
  const tinta = readCssToken("--cn-tinta") ?? "";
  return {
    name: SITE.name,
    short_name: "CityNews",
    description: SITE.description,
    lang: "pt-BR",
    dir: "ltr",
    id: "/",
    start_url: "/?origem=app",
    scope: "/",
    display: "standalone",
    background_color: tinta,
    theme_color: tinta,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      {
        name: "Últimas",
        url: "/#ultimas",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Salvos",
        url: "/favoritos",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      { name: "Busca", url: "/busca", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
