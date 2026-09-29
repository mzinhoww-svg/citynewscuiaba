"use server";

import { revalidatePath } from "next/cache";
import { flash, requireAreaInAction } from "@/lib/admin/guard";
import { clearLoginBlocks } from "@/lib/admin/writes";

const BACK = "/estudio/admin/seguranca";

export async function clearLoginBlocksAction(): Promise<void> {
  await requireAreaInAction("seguranca", BACK);
  const r = await clearLoginBlocks();
  revalidatePath(BACK);
  if (r.ok) flash(BACK, "ok", r.code);
  flash(BACK, "erro", r.code);
}
