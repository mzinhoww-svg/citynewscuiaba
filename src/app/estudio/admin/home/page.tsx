import type { Metadata } from "next";
import { HomeModulesEditor } from "@/components/estudio";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { requireRole } from "@/lib/auth/require-role";
import { homeLayouts } from "@/lib/db/queries/admin";
import { loadOrNull } from "../../load-error";
import { discardHomeDraftAction, publishHomeAction, saveHomeDraftAction } from "../actions";
import { AdminScreen } from "../screen";

export const metadata: Metadata = { title: "Home e módulos · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** A06 · Home e módulos: ordem e ativação, rascunho versionado e publicação. */
export default async function HomeModulesPage() {
  await requireRole("site.manage", undefined, { next: "/estudio/admin/home" });
  const data = await loadOrNull("admin home", () => homeLayouts());
  return (
    <AdminScreen
      title={T.home.title}
      intro={T.home.intro}
      retryHref="/estudio/admin/home"
      failed={data === null}
    >
      {data && (
        <HomeModulesEditor
          data={data.value}
          saveDraft={saveHomeDraftAction}
          publish={publishHomeAction}
          discard={discardHomeDraftAction}
        />
      )}
    </AdminScreen>
  );
}
