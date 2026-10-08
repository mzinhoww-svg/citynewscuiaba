import "server-only";
import { createPublicClient } from "./client";

/**
 * Referência da foto do Google do lugar para a rota `/api/guia/foto/[slug]` (A-212). Lido com o
 * cliente público: a RLS `venues_read_public` só mostra lugar ativo citado por lista publicada.
 * Sem banco ou com erro, `null` (a rota responde 404).
 */
export async function googlePhotoNameFor(slug: string): Promise<string | null> {
  const { data, error } = await createPublicClient()
    .from("venues")
    .select("google_photo_name")
    .eq("slug", slug)
    .eq("status", "active")
    .not("google_photo_name", "is", null)
    .maybeSingle();
  if (error || !data) return null;
  return data.google_photo_name;
}
