import type { Metadata } from "next";
import { TaxonomyPanel } from "@/components";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { requireRole } from "@/lib/auth/require-role";
import { taxonomyOverview } from "@/lib/db/queries/admin";
import { loadOrNull } from "../../load-error";
import {
  createPlaceAction,
  createSectionAction,
  mergeTagsAction,
  renameSectionAction,
  togglePlaceAction,
} from "../actions";
import { AdminScreen } from "../screen";

export const metadata: Metadata = { title: "Taxonomia · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** A05 · Taxonomia: editorias, tags (com mesclagem sugerida) e lugares. */
export default async function TaxonomyPage() {
  await requireRole("site.manage", undefined, { next: "/estudio/admin/taxonomia" });
  const data = await loadOrNull("admin taxonomy", () => taxonomyOverview());
  return (
    <AdminScreen
      title={T.taxonomy.title}
      intro={T.taxonomy.intro}
      retryHref="/estudio/admin/taxonomia"
      failed={data === null}
    >
      {data && (
        <TaxonomyPanel
          data={data.value}
          createSection={createSectionAction}
          renameSection={renameSectionAction}
          createPlace={createPlaceAction}
          togglePlace={togglePlaceAction}
          mergeTags={mergeTagsAction}
        />
      )}
    </AdminScreen>
  );
}
