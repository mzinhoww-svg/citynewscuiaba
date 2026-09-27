import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { SITE } from "@/content/pt-BR/site";
import "@/styles/globals.css";

const schibsted = localFont({
  src: [
    { path: "./fonts/SchibstedGrotesk-normal.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/SchibstedGrotesk-italic.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-schibsted",
  display: "swap",
});

const sourceSerif = localFont({
  src: [
    { path: "./fonts/SourceSerif4-normal.woff2", weight: "200 900", style: "normal" },
    { path: "./fonts/SourceSerif4-italic.woff2", weight: "200 900", style: "italic" },
  ],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: SITE.name,
  description: SITE.description,
};

/* Aplica o tema salvo (cn_theme) ou o do sistema antes da primeira pintura. */
const themeScript = `(function(){try{var t=localStorage.getItem("cn_theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${schibsted.variable} ${sourceSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-page text-strong antialiased">{children}</body>
    </html>
  );
}
