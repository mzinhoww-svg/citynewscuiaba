import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { IconSprite } from "@/components";
import { SITE } from "@/content/pt-BR/site";
import { siteUrl } from "@/lib/seo/jsonld";
import "@/styles/globals.css";

/*
 * Só as faces normais (P6-T1, docs/reports/perf.md): o portal não usa itálico (nem na leitura nem
 * na interface), e `next/font` pré-carrega todas as faces declaradas; as duas itálicas somavam
 * ~180 kB em toda página. O `<em>` do editor do Estúdio usa o itálico sintetizado do navegador.
 * `display: swap` mostra o texto na hora com a fonte de reserva de métrica ajustada (sem salto).
 */
const schibsted = localFont({
  src: [{ path: "./fonts/SchibstedGrotesk-normal.woff2", weight: "400 800", style: "normal" }],
  variable: "--font-schibsted",
  display: "swap",
});

const sourceSerif = localFont({
  src: [{ path: "./fonts/SourceSerif4-normal.woff2", weight: "400 700", style: "normal" }],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: SITE.name,
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "pt_BR",
    images: [{ url: "/brand/citynews-horizontal.png", alt: SITE.name }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1320" },
  ],
};

/* Aplica o tema salvo (cn_theme) ou o do sistema e o tamanho de leitura (cn_reading_size) antes da primeira pintura. */
const themeScript = `(function(){try{var t=localStorage.getItem("cn_theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t);var r=localStorage.getItem("cn_reading_size");if(r==="lg"||r==="xl")document.documentElement.setAttribute("data-reading-size",r)}catch(e){}})();`;

/**
 * Lê o nonce da CSP (src/proxy.ts) para o script de tema. Ler cabeçalhos torna as páginas
 * dinâmicas: o HTML sai por requisição e o cache fica nos dados (fetch com tags, A-038).
 */
export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="pt-BR"
      className={`${schibsted.variable} ${sourceSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-page text-strong antialiased">
        <IconSprite />
        {children}
      </body>
    </html>
  );
}
