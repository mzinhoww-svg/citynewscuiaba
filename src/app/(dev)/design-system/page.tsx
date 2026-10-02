import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Showcase } from "./Showcase";

/* Decidido por requisição: em produção só abre com CN_SHOW_DS=1 (teste de a11y no build). */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vitrine do design system · CityNews Cuiabá",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production" && process.env.CN_SHOW_DS !== "1") notFound();
  return <Showcase />;
}
