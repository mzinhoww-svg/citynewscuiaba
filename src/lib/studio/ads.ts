import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ADS_ADMIN_TEXT as T } from "@/content/pt-BR/ads-admin";
import { parseCreative } from "@/lib/ads/creative";
import { reportCsv, reportPeriod } from "@/lib/ads/report";
import { isNeverSection } from "@/lib/ads/rules";
import { DISPLAY_SLOTS, fitsSlot } from "@/lib/ads/slots";
import { validateUpload } from "@/lib/ads/upload";
import type { DbClient } from "@/lib/db/client";
import { adReportRows } from "@/lib/db/queries/ads-admin";
import type { Json } from "@/lib/db/types";
import { StudioFailure, studioAction } from "./action";

/*
 * Banners no Estúdio (ADS-T4, `site.manage`: admin e editor-chefe). Cadastro com envio da
 * imagem (tipo e dimensões lidos dos bytes, até 200 KB), anunciante pelo nome (cria se for novo;
 * em branco = peça da casa) e mudança de situação da veiculação. Nunca em Política, Justiça,
 * Segurança ou Saúde: a regra roda aqui e de novo no banco (`guard_ad_placement`, 0082).
 */

/** Guarda a imagem no bucket `ads` e devolve o endereço público; `null` se falhar. */
export type AdImageUpload = (
  path: string,
  bytes: Uint8Array,
  contentType: string,
) => Promise<string | null>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const SECTION = /^[a-z0-9-]+$/;

const BannerInput = z.object({
  slot: z.enum(DISPLAY_SLOTS, { message: T.error.slot }),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  advertiser: z.string().trim().max(80),
  href: z
    .string()
    .trim()
    .url(T.error.https)
    .max(500)
    .regex(/^https:\/\//i, T.error.https),
  alt: z.string().trim().min(1).max(200),
  startsOn: z.string().regex(DAY),
  endsOn: z.string().regex(DAY),
  allowedSections: z.array(z.string().regex(SECTION)).max(40),
  weight: z.number().int().min(1).max(100),
  maxPerDay: z.number().int().positive().nullable(),
  status: z.enum(["draft", "active"]),
  image: z.custom<Uint8Array>((v) => v instanceof Uint8Array, T.error.type),
});
export type BannerInput = z.input<typeof BannerInput>;

async function advertiserId(db: DbClient, name: string, userId: string): Promise<string | null> {
  if (name.length < 2) return null;
  const found = await db
    .from("advertisers")
    .select("id, name")
    .ilike("name", name.replace(/[%_\\]/g, "\\$&"));
  if (found.error) throw new Error(`advertiser: ${found.error.message}`);
  const same = found.data?.find((a) => a.name.trim().toLowerCase() === name.toLowerCase());
  if (same) return same.id;
  const created = await db
    .from("advertisers")
    .insert({ name, created_by: userId })
    .select("id")
    .single();
  if (created.error) throw new Error(`advertiser: ${created.error.message}`);
  return created.data.id;
}

export function createBannerCommand(upload: AdImageUpload) {
  return studioAction(
    "site.manage",
    () => ({}),
    async (i, ctx): Promise<{ id: string }> => {
      if (!fitsSlot(i.slot, i.width, i.height)) throw new StudioFailure("invalid", T.error.format);
      if (i.endsOn < i.startsOn) throw new StudioFailure("invalid", T.error.period);
      if (i.allowedSections.length > 0) {
        const cats = await ctx.db
          .from("sections")
          .select("slug, autonomy_category")
          .in("slug", i.allowedSections);
        if (cats.error) throw new Error(`banner sections: ${cats.error.message}`);
        const categoryOf = (s: string) =>
          cats.data?.find((c) => c.slug === s)?.autonomy_category ?? undefined;
        if (i.allowedSections.some((s) => isNeverSection(s, categoryOf)))
          throw new StudioFailure("invalid", T.error.forbiddenSection);
      }
      const img = validateUpload(i.image, { width: i.width, height: i.height });
      if (!img.ok) {
        const msg =
          img.error === "dimensions" ? T.error.dimensions(i.width, i.height) : T.error[img.error];
        throw new StudioFailure("invalid", msg);
      }
      const path = `${i.slot}/${randomUUID()}.${img.value.ext}`;
      const imageUrl = await upload(path, i.image, img.value.type);
      if (!imageUrl) throw new StudioFailure("conflict", T.error.storage);
      const creative = parseCreative({
        kind: "display",
        slot: i.slot,
        width: i.width,
        height: i.height,
        imageUrl,
        alt: i.alt,
        href: i.href,
        weight: i.weight,
      });
      if (!creative.ok) throw new StudioFailure("invalid", T.error.invalid);

      const adv = await advertiserId(ctx.db, i.advertiser, ctx.userId);
      const c = await ctx.db
        .from("ad_creatives")
        .insert({
          slot: i.slot,
          name: i.name,
          advertiser_id: adv,
          creative: creative.value as NonNullable<Json>,
          status: "active",
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (c.error) throw new Error(`banner creative: ${c.error.message}`);
      const p = await ctx.db
        .from("ad_placements")
        .insert({
          creative_id: c.data.id,
          slot: i.slot,
          starts_on: i.startsOn,
          ends_on: i.endsOn,
          allowed_sections: i.allowedSections,
          weight: i.weight,
          max_impressions_per_day: i.maxPerDay,
          status: i.status,
          created_by: ctx.userId,
        })
        .select("id")
        .single();
      if (p.error) {
        await ctx.db.from("ad_creatives").delete().eq("id", c.data.id);
        if (p.error.code === "23514") throw new StudioFailure("invalid", T.error.forbiddenSection);
        throw new Error(`banner placement: ${p.error.message}`);
      }
      ctx.setObjectRef(`placement:${p.data.id}`);
      ctx.detail({
        slot: i.slot,
        format: `${i.width}x${i.height}`,
        advertiser: i.advertiser || null,
        sections: i.allowedSections,
        period: [i.startsOn, i.endsOn],
        status: i.status,
        image: path,
      });
      await ctx.revalidate(["ads"]);
      return { id: p.data.id };
    },
    { schema: BannerInput, auditAs: "ads.banner.create" },
  );
}

const StatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused", "ended"]),
});

export const setPlacementStatusCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: z.infer<typeof StatusInput>, ctx): Promise<{ status: string }> => {
    const { data, error } = await ctx.db
      .from("ad_placements")
      .update({ status: i.status })
      .eq("id", i.id)
      .select("id, status")
      .maybeSingle();
    if (error) throw new Error(`placement status: ${error.message}`);
    if (!data) throw new StudioFailure("not_found");
    ctx.detail({ status: i.status });
    await ctx.revalidate(["ads"]);
    return { status: data.status };
  },
  {
    schema: StatusInput,
    auditAs: "ads.placement.status",
    objectRef: (i) => `placement:${i.id}`,
  },
);

/** CSV do relatório no período (só leitura; vale também em modo leitura). */
export const exportAdReportCommand = studioAction(
  "site.manage",
  () => ({}),
  async (
    i: { from?: string; to?: string },
    ctx,
  ): Promise<{ csv: string; from: string; to: string }> => {
    const period = reportPeriod(i, ctx.now());
    const rows = await adReportRows(period, ctx.db);
    ctx.detail({ period: [period.from, period.to], rows: rows.length });
    return { csv: reportCsv(rows), ...period };
  },
  {
    auditAs: "ads.report.export",
    objectRef: () => "ads:report",
    allowReadOnly: true,
  },
);
