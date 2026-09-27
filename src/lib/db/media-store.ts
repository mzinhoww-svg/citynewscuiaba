import "server-only";
import { err, ok } from "@/lib/result";
import type { MediaStore } from "@/lib/media/store";
import type { DbClient } from "./client";

/** Bucket privado de mídia (ADR-009). Leitura pública só por URL assinada ou CDN de aprovadas. */
export const MEDIA_BUCKET = "media";

/** MediaStore no Supabase Storage (service role). */
export function createSupabaseMediaStore(db: DbClient): MediaStore {
  const bucket = () => db.storage.from(MEDIA_BUCKET);
  return {
    kind: "supabase",
    async put(path, bytes, contentType) {
      const { error } = await bucket().upload(path, bytes, { contentType, upsert: true });
      return error ? err(error.message) : ok({ path });
    },
    async remove(path) {
      const { error } = await bucket().remove([path]);
      return error ? err(error.message) : ok(undefined);
    },
  };
}
