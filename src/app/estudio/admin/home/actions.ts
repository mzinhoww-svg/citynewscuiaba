"use server";

import { revalidatePath } from "next/cache";
import { HOME_ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";
import { publishHome, saveHomeDraft } from "@/lib/admin/home";
import type { HomeModule } from "@/lib/home/modules";
import type { HomeSaveReply } from "@/components";

/** Ações do editor da home: devolvem o texto pronto para a região de status do editor. */
export async function saveHomeDraftAction(modules: HomeModule[]): Promise<HomeSaveReply> {
  const r = await saveHomeDraft({ modules });
  if (!r.ok)
    return {
      ok: false,
      message: r.message ?? (r.error === "forbidden" ? ADMIN_TEXT.forbidden : T.error),
    };
  revalidatePath("/estudio/admin/home");
  return { ok: true, message: T.draftSaved };
}

export async function publishHomeAction(modules: HomeModule[]): Promise<HomeSaveReply> {
  const r = await publishHome({ modules });
  if (!r.ok)
    return {
      ok: false,
      message: r.message ?? (r.error === "forbidden" ? ADMIN_TEXT.forbidden : T.error),
    };
  revalidatePath("/estudio/admin/home");
  revalidatePath("/");
  return { ok: true, message: T.published(r.value.version) };
}
