import "server-only";
import { err, ok } from "@/lib/result";
import type { MediaStore } from "@/lib/media/store";
import type { DbClient } from "./client";

/** Bucket privado de mídia (ADR-009). Leitura pública só por URL assinada ou CDN de aprovadas. */
export const MEDIA_BUCKET = "media";

/**
 * MediaStore no Supabase Storage (service role). `bucketName`: outro bucket privado com a mesma
 * interface (pacotes do Instagram, `social-packages`, ARD-T6).
 */
export function createSupabaseMediaStore(
  db: DbClient,
  bucketName: string = MEDIA_BUCKET,
): MediaStore {
  const bucket = () => db.storage.from(bucketName);
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
    async signedUrl(path, expiresInSec) {
      const { data, error } = await bucket().createSignedUrl(path, expiresInSec);
      return error || !data ? err(error?.message ?? "sem URL assinada") : ok(data.signedUrl);
    },
    async read(path) {
      const { data, error } = await bucket().download(path);
      if (error || !data) return err(error?.message ?? "arquivo não encontrado");
      return ok({ bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type });
    },
  };
}
