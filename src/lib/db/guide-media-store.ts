import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { VenueMediaRepo, VenuesOfMedia } from "@/lib/guide/venue-media";
import type { VenuePhotoStore } from "@/lib/pipeline/steps/venue-photos";
import { insertExternalAsset } from "./external-media-store";
import { createMediaRepo } from "./pipeline-store";

/**
 * Fotos oficiais dos lugares no banco (service role): ativo em `media_assets` pela mesma função
 * das reproduções de matéria (`media_insert_asset`, sem fonte, via `insertExternalAsset`), ligação em `venue_media` e as
 * consultas da retirada a pedido. Reaproveita `createMediaRepo` para origem, hash e bloqueio.
 */
export function createVenueMediaRepo(
  db: DbClient,
): VenueMediaRepo & VenuesOfMedia & VenuePhotoStore {
  const media = createMediaRepo(db);
  return {
    assetByOrigin: media.assetByOrigin,
    phashNeighbors: media.phashNeighbors,

    insertVenueAsset: (a) => insertExternalAsset(db, a),

    async linkVenueMedia(l) {
      const { error } = await db.from("venue_media").upsert(
        {
          venue_id: l.venueId,
          media_id: l.mediaId,
          credit: l.credit,
          origin_url: l.originUrl,
          position: l.position,
        },
        { onConflict: "venue_id,media_id" },
      );
      if (error) throw new Error(`venue media: ${error.message}`);
    },

    async venuesOfMedia(mediaId) {
      const { data, error } = await db
        .from("venue_media")
        .select("venue_id, venues(slug)")
        .eq("media_id", mediaId);
      if (error) throw new Error(`venue media of: ${error.message}`);
      const out: { venueId: string; venueSlug: string; listSlugs: string[] }[] = [];
      for (const row of data ?? []) {
        const items = await db
          .from("guide_list_items")
          .select("guide_lists(slug)")
          .eq("venue_id", row.venue_id);
        if (items.error) throw new Error(`venue lists: ${items.error.message}`);
        out.push({
          venueId: row.venue_id,
          venueSlug: row.venues?.slug ?? "",
          listSlugs: (items.data ?? []).flatMap((x) => (x.guide_lists ? [x.guide_lists.slug] : [])),
        });
      }
      return out;
    },

    async venuesNeedingPhoto(before, limit) {
      const { data, error } = await db
        .from("venues")
        .select("id, name, website, venue_media(id), guide_list_items(list_id)")
        .eq("status", "active")
        .not("website", "is", null)
        .or(`photo_checked_at.is.null,photo_checked_at.lt.${before.toISOString()}`)
        .order("photo_checked_at", { ascending: true, nullsFirst: true })
        .limit(Math.max(limit, 1) * 6);
      if (error) throw new Error(`venues photo: ${error.message}`);
      return (data ?? [])
        .filter((v) => v.website && (v.venue_media ?? []).length === 0)
        .sort(
          (a, b) =>
            Number((b.guide_list_items ?? []).length > 0) -
            Number((a.guide_list_items ?? []).length > 0),
        )
        .slice(0, limit)
        .map((v) => ({ id: v.id, name: v.name, website: v.website as string }));
    },

    async markPhotoChecked(id, at) {
      const { error } = await db
        .from("venues")
        .update({ photo_checked_at: at.toISOString() })
        .eq("id", id);
      if (error) throw new Error(`venue photo mark: ${error.message}`);
    },
  };
}
