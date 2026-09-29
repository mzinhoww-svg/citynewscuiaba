"use server";

import { revalidatePath } from "next/cache";
import { flash, requireAreaInAction } from "@/lib/admin/guard";
import { SETTING_KEYS, type SettingKey } from "@/lib/admin/settings";
import { saveSettings } from "@/lib/admin/writes";

const BACK = "/estudio/admin/configuracoes";
const KEYS: SettingKey[] = [
  "general.contact_email",
  "general.tip_email",
  "notify.quiet_start",
  "notify.quiet_end",
  "notify.max_push_per_day",
];

export async function saveSettingsAction(formData: FormData): Promise<void> {
  await requireAreaInAction("configuracoes", BACK);
  const input: Partial<Record<string, string>> = {};
  for (const k of KEYS) {
    const v = formData.get(k);
    if (typeof v === "string") input[k] = v;
  }
  const r = await saveSettings(input, KEYS);
  revalidatePath(BACK);
  revalidatePath("/estudio/admin/notificacoes");
  if (r.ok) flash(BACK, "ok", r.code);
  const bad = Object.keys(r.errors ?? {})[0];
  flash(
    BACK,
    "erro",
    r.code,
    bad && (SETTING_KEYS as readonly string[]).includes(bad) ? { campo: bad } : {},
  );
}
