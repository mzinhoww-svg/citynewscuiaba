"use server";

import { revalidatePath } from "next/cache";
import { flash, requireAreaInAction } from "@/lib/admin/guard";
import { SETTING_KEYS, type SettingKey } from "@/lib/admin/settings";
import { saveSettings } from "@/lib/admin/writes";

const BACK = "/estudio/admin/seo";
const KEYS: SettingKey[] = ["seo.title_template", "seo.default_description"];

export async function saveSeoAction(formData: FormData): Promise<void> {
  await requireAreaInAction("seo", BACK);
  const input: Partial<Record<string, string>> = {};
  for (const k of KEYS) {
    const v = formData.get(k);
    if (typeof v === "string") input[k] = v;
  }
  const r = await saveSettings(input, KEYS);
  revalidatePath(BACK);
  if (r.ok) flash(BACK, "ok", r.code);
  const bad = Object.keys(r.errors ?? {})[0];
  flash(
    BACK,
    "erro",
    r.code,
    bad && (SETTING_KEYS as readonly string[]).includes(bad) ? { campo: bad } : {},
  );
}
