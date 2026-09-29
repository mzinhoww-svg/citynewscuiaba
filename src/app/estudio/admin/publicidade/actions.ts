"use server";

import { revalidatePath } from "next/cache";
import { requireAreaInAction, flash } from "@/lib/admin/guard";
import {
  saveCampaign,
  setCampaignActive,
  setSponsoredFlag,
  type AdminReply,
} from "@/lib/admin/writes";

const BACK = "/estudio/admin/publicidade";

function done(r: AdminReply): never {
  revalidatePath(BACK);
  if (r.ok) flash(BACK, "ok", r.code);
  flash(BACK, "erro", r.code);
}

export async function createCampaignAction(formData: FormData): Promise<void> {
  await requireAreaInAction("publicidade", BACK);
  const r = await saveCampaign({
    advertiser: String(formData.get("advertiser") ?? ""),
    startsOn: String(formData.get("startsOn") ?? ""),
    endsOn: String(formData.get("endsOn") ?? ""),
    sections: formData.getAll("sections").map(String),
    headline: String(formData.get("headline") ?? ""),
    url: String(formData.get("url") ?? ""),
  });
  done(r);
}

export async function toggleCampaignAction(formData: FormData): Promise<void> {
  await requireAreaInAction("publicidade", BACK);
  const active = formData.get("active") === "1";
  const r = await setCampaignActive(String(formData.get("id") ?? ""), active);
  done(r);
}

export async function sponsoredFlagAction(formData: FormData): Promise<void> {
  await requireAreaInAction("publicidade", BACK);
  const enabled = formData.get("enabled") === "1";
  const r = await setSponsoredFlag(enabled);
  done(r);
}
