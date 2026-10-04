import type { Metadata } from "next";
import { TemplatesPanel } from "@/components/estudio";
import { createServerClient } from "@/lib/db/client";
import { adminStatus, adminTemplates } from "@/lib/db/queries/guide-admin";
import { CATEGORIES } from "@/lib/guide/categories";
import { loadOrNull } from "../../../load-error";
import { guideSession } from "../access";
import { proposeTemplateNowAction, saveTemplateAction } from "../actions";
import { GuideScreen } from "../GuideScreen";

export const metadata: Metadata = {
  title: "Modelos · Guia Cuiabá · Administração · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({
  slug: c.slug,
  label: c.singular.charAt(0).toUpperCase() + c.singular.slice(1),
}));

/** Guia · Modelos: o catálogo de listas (categoria x bairro x cozinha) que alimenta as propostas. */
export default async function GuideTemplatesPage() {
  await guideSession("/estudio/admin/guia/modelos");
  const data = await loadOrNull("guide templates", async () => {
    const db = await createServerClient();
    const [templates, status] = await Promise.all([adminTemplates(db), adminStatus(db)]);
    return { templates, status };
  });
  return (
    <GuideScreen active="modelos" status={data?.value.status ?? null} failed={data === null}>
      {data && (
        <TemplatesPanel
          templates={data.value.templates}
          categories={CATEGORY_OPTIONS}
          save={saveTemplateAction}
          proposeNow={proposeTemplateNowAction}
        />
      )}
    </GuideScreen>
  );
}
