"use server";

import type { AdminReply } from "@/components/estudio";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";
import { ADS_ADMIN_TEXT as T, PLACEMENT_STATUS_LABEL } from "@/content/pt-BR/ads-admin";
import { createServiceClient } from "@/lib/db/client";
import {
  createBannerCommand,
  setPlacementStatusCommand,
  type AdImageUpload,
  type BannerInput,
} from "@/lib/studio/ads";

/*
 * Server Actions do painel de banners (ADS-T4): camada fina sobre src/lib/studio/ads. O comando
 * confere o papel antes de qualquer envio; a imagem vai para o bucket público `ads` com o
 * cliente de serviço (como os logotipos das fontes), porque o bucket não tem política de escrita.
 */

const BUCKET = "ads";

const uploadToStorage: AdImageUpload = async (path, bytes, contentType) => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    const { error } = await createServiceClient()
      .storage.from(BUCKET)
      .upload(path, bytes, { contentType, upsert: false });
    if (error) return null;
    return `${base.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
  } catch {
    return null;
  }
};

const createBanner = createBannerCommand(uploadToStorage);

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const int = (f: FormData, k: string) => {
  const v = str(f, k);
  return /^\d+$/.test(v) ? Number(v) : NaN;
};

export async function createBannerAction(form: FormData): Promise<AdminReply> {
  const file = form.get("imagem");
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, message: T.error.type };
  if (file.size > 200 * 1024) return { ok: false, message: T.error.size };
  const [w, h] = str(form, "formato").split("x").map(Number);
  const maxPerDay = str(form, "teto");
  const name = str(form, "nome");
  const r = await createBanner({
    slot: str(form, "campo") as BannerInput["slot"],
    width: w ?? NaN,
    height: h ?? NaN,
    name,
    advertiser: str(form, "anunciante"),
    href: str(form, "link"),
    alt: str(form, "alt"),
    startsOn: str(form, "inicio"),
    endsOn: str(form, "fim"),
    allowedSections: form.getAll("editorias").filter((v): v is string => typeof v === "string"),
    weight: int(form, "peso"),
    maxPerDay: maxPerDay ? int(form, "teto") : null,
    status: str(form, "situacao") === "draft" ? "draft" : "active",
    image: new Uint8Array(await file.arrayBuffer()),
  });
  if (!r.ok) return { ok: false, message: r.message ?? ADMIN_TEXT.genericError };
  return { ok: true, message: T.saved(name) };
}

export async function setPlacementStatusAction(i: {
  id: string;
  status: "active" | "paused" | "ended";
}): Promise<AdminReply> {
  const r = await setPlacementStatusCommand(i);
  if (!r.ok) return { ok: false, message: r.message ?? ADMIN_TEXT.genericError };
  return { ok: true, message: T.statusSaved(PLACEMENT_STATUS_LABEL[i.status]) };
}
