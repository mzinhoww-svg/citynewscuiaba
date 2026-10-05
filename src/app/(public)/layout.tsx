import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { PublicShell, ToastProvider } from "@/components";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";

/**
 * Metadados de instalação (spec 2026-09-28 §7.10): ícone e splash do iOS, título do app na
 * Tela de Início e barra translúcida. O manifesto fica em `src/app/manifest.ts`.
 */
export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CityNews",
    /* eslint-disable no-restricted-syntax -- consultas de mídia da splash do iOS: o Safari exige px
       do aparelho, não é classe de UI */
    startupImage: [
      {
        url: "/icons/splash-1170x2532.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/icons/splash-1179x2556.png",
        media:
          "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/icons/splash-1284x2778.png",
        media:
          "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)",
      },
    ],
    /* eslint-enable no-restricted-syntax */
  },
  icons: { apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180" }] },
};

/**
 * Lê a escolha de privacidade no servidor para o banner não piscar para quem já respondeu.
 * O HTML já é por requisição (nonce da CSP, A-042); o cache continua nos dados.
 */
export default async function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  return (
    <ToastProvider>
      <PublicShell consent={consent}>{children}</PublicShell>
    </ToastProvider>
  );
}
