import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { guideSession } from "./access";

export const metadata: Metadata = { title: "Guia Cuiabá · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** Entrada do admin do Guia: abre a aba Propostas (docs/screens.md). */
export default async function GuideAdminPage() {
  await guideSession("/estudio/admin/guia");
  redirect("/estudio/admin/guia/propostas");
}
