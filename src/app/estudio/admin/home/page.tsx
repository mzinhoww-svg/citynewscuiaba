import type { Metadata } from "next";
import { HomeModulesEditor } from "@/components";
import { HOME_ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { requireRole } from "@/lib/auth/require-role";
import { getHomeEditorState, type HomeEditorState } from "@/lib/admin/home";
import { AdminLoadError } from "../load-error";
import { publishHomeAction, saveHomeDraftAction } from "./actions";

export const metadata: Metadata = { title: "Home e módulos · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/home";

export default async function HomeAdminPage() {
  await requireRole("users.manage", undefined, { next: NEXT });
  let state: HomeEditorState | null = null;
  try {
    state = await getHomeEditorState();
  } catch (e) {
    console.error("estudio home:", e instanceof Error ? e.message : e);
  }
  const status =
    state === null
      ? null
      : state.source === "draft"
        ? `${T.status.draft} ${state.publishedVersion ? T.status.published(state.publishedVersion) : T.status.none}`
        : state.publishedVersion
          ? T.status.published(state.publishedVersion)
          : T.status.none;
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
        <p className="type-body text-strong">{T.fixed}</p>
        {status && <p className="type-meta text-meta">{status}</p>}
      </header>
      {state === null ? (
        <AdminLoadError href={NEXT} />
      ) : (
        <HomeModulesEditor
          initial={state.modules}
          saveDraft={saveHomeDraftAction}
          publish={publishHomeAction}
        />
      )}
    </section>
  );
}
