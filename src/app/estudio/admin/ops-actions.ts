"use server";

import type { AdminReply } from "@/components";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";
import { ADMIN_OPS_TEXT as T, PRIVACY_STATUS_LABEL } from "@/content/pt-BR/admin-ops";
import type { Campaign } from "@/lib/ads/rules";
import type { Json } from "@/lib/db/types";
import type { StudioResult } from "@/lib/studio/action";
import {
  deleteCampaignCommand,
  deleteRedirectCommand,
  rotateKeyCommand,
  saveCampaignCommand,
  savePrivacyRequestCommand,
  saveRedirectCommand,
  setSettingCommand,
  type PrivacyInput,
} from "@/lib/studio/admin-ops";

/* Server Actions da Administração, parte 2 (P5-T9): camada fina sobre src/lib/studio/admin-ops. */

function reply<O>(r: StudioResult<O>, ok: (v: O) => string): AdminReply {
  if (!r.ok) return { ok: false, message: r.message ?? ADMIN_TEXT.genericError };
  return { ok: true, message: ok(r.value) };
}

export async function saveCampaignAction(i: Omit<Campaign, "id"> & { id?: string }) {
  return reply(await saveCampaignCommand(i), () => T.ads.dialog.saved(i.advertiser));
}

export async function deleteCampaignAction(i: { id: string }) {
  return reply(await deleteCampaignCommand(i), () => T.ads.dialog.removed);
}

export async function saveTitleTemplateAction(i: { value: string }) {
  return reply(
    await setSettingCommand({ key: "seo.title_template", value: i.value }),
    () => T.seo.titleTemplateSaved,
  );
}

export async function saveRedirectAction(i: {
  fromPath: string;
  toPath: string;
  kind: 301 | 302;
  reason: string;
}) {
  return reply(await saveRedirectCommand(i), (v) => T.seo.dialog.saved(v.fromPath, v.toPath));
}

export async function deleteRedirectAction(i: { id: string }) {
  return reply(await deleteRedirectCommand(i), () => T.seo.dialog.removed);
}

/** O segundo fator ainda não é aplicado (chave fica desligada); só sessão e retenção valem. */
export async function saveSecuritySettingsAction(i: {
  sessionHours: number;
  retentionDays: number;
}) {
  const steps: [string, Json][] = [
    ["security.session_hours", i.sessionHours],
    ["security.retention_days", i.retentionDays],
  ];
  for (const [key, value] of steps) {
    const r = await setSettingCommand({ key, value });
    if (!r.ok) return reply(r, () => "");
  }
  return { ok: true, message: T.security.saved };
}

export async function savePrivacyRequestAction(i: PrivacyInput) {
  return reply(await savePrivacyRequestCommand(i), () =>
    i.id && i.status
      ? T.security.dialog.statusChanged(PRIVACY_STATUS_LABEL[i.status])
      : T.security.dialog.saved,
  );
}

export async function rotateKeyAction(i: { key: string }) {
  return reply(await rotateKeyCommand(i), (v) => T.security.rotated(v.key));
}

export async function setSettingAction(i: { key: string; value: Json }) {
  return reply(await setSettingCommand(i), (v) => T.settings.saved(v.key));
}
