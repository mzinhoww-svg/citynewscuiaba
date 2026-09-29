"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorKey } from "../flash";
import {
  createSubsection,
  createTag,
  deleteTag,
  mergeTags,
  renameSection,
  renameTag,
} from "@/lib/admin/taxonomy";

const BACK = "/estudio/admin/taxonomia";
const fail = (r: Parameters<typeof errorKey>[0]): never =>
  redirect(`${BACK}?erro=${encodeURIComponent(errorKey(r))}`);
const done = (key: string): never => {
  revalidatePath(BACK);
  return redirect(`${BACK}?ok=${key}`);
};
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function createTagAction(formData: FormData): Promise<void> {
  const r = await createTag({ name: str(formData, "name") });
  if (!r.ok) return fail(r);
  return done("tag-criada");
}

export async function renameTagAction(formData: FormData): Promise<void> {
  const r = await renameTag({ id: str(formData, "id"), name: str(formData, "name") });
  if (!r.ok) return fail(r);
  return done("tag-renomeada");
}

export async function deleteTagAction(formData: FormData): Promise<void> {
  const r = await deleteTag({ id: str(formData, "id") });
  if (!r.ok) return fail(r);
  return done("tag-excluida");
}

export async function mergeTagsAction(formData: FormData): Promise<void> {
  const r = await mergeTags({ fromId: str(formData, "fromId"), intoId: str(formData, "intoId") });
  if (!r.ok) return fail(r);
  revalidatePath(BACK);
  return redirect(`${BACK}?ok=mesclada&n=${r.value.moved}`);
}

export async function renameSectionAction(formData: FormData): Promise<void> {
  const r = await renameSection({ slug: str(formData, "slug"), name: str(formData, "name") });
  if (!r.ok) return fail(r);
  return done("editoria-salva");
}

export async function createSubsectionAction(formData: FormData): Promise<void> {
  const r = await createSubsection({
    name: str(formData, "name"),
    parentSlug: str(formData, "parentSlug"),
  });
  if (!r.ok) return fail(r);
  return done("editoria-criada");
}
